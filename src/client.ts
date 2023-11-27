import got, { HTTPError, OptionsOfJSONResponseBody } from "got";

import * as querystring from "querystring";
import { Buffer } from "buffer";
import {
    Device,
    EnergyUseData,
    GetDevicesResponseData,
    GetEnergyUseDataResponseData,
    GraphQLResponse,
    IsEverythingOkayResponseData,
    LoginResponseData,
    UpdateModeResponseData,
    UpdateSetpointResponseData,
    isFailedGraphQLResponse,
} from "./types.js";
import { AOSmithInvalidCredentialsError, AOSmithInvalidParametersError, AOSmithUnknownError } from "./errors.js";

const gotClient = got.extend({
    prefixUrl: "https://r2.wh8.co/",
    method: "POST",
    responseType: "json",
});

const DEVICES_GRAPHQL_QUERY = `
query devices($forceUpdate: Boolean, $junctionIds: [String]) {
    devices(forceUpdate: $forceUpdate, junctionIds: $junctionIds) {
        brand
        model
        deviceType
        dsn
        junctionId
        name
        serial
        install {
            location
        }
        data {
            __typename
            temperatureSetpoint
            temperatureSetpointPending
            temperatureSetpointPrevious
            temperatureSetpointMaximum
            modes {
                mode
                controls
            }
            isOnline
            ... on NextGenHeatPump {
                firmwareVersion
                hotWaterStatus
                mode
                modePending
                vacationModeRemainingDays
                electricModeRemainingDays
            }
        }
    }
}
`;

const MAX_RETRIES = 2;

export class AOSmithAPIClient {
    private email: string;
    private password: string;

    private token?: string;

    constructor(email: string, password: string) {
        this.email = email;
        this.password = password;
    }

    private static buildPasscode(email: string, password: string) {
        const jsonString = JSON.stringify({ email, password });
        const urlEncoded = querystring.escape(jsonString);
        const base64Encoded = Buffer.from(urlEncoded).toString("base64");
        return base64Encoded;
    }

    private async sendGraphQLQuery<T>(
        query: string,
        variables: object = {},
        loginRequired: boolean = true,
        retryCount: number = 0,
    ): Promise<T> {
        if (retryCount >= MAX_RETRIES) throw new AOSmithUnknownError("Request failed - max retries exceeded");

        const gotOptions: OptionsOfJSONResponseBody = {
            url: "graphql",
            json: {
                query,
                variables,
            },
        };

        if (loginRequired) {
            if (this.token === undefined) await this.login();
            if (this.token === undefined) throw new AOSmithUnknownError("Login failed");

            gotOptions.headers = {
                Authorization: `Bearer ${this.token}`,
            };
        }

        let response;
        try {
            response = await gotClient<GraphQLResponse<T>>(gotOptions);
        } catch (err) {
            if (err instanceof HTTPError) {
                if (err.response.statusCode === 401) {
                    // Access token may be expired - try to log in again
                    await this.login();
                    return this.sendGraphQLQuery(query, variables, loginRequired, retryCount + 1);
                } else {
                    throw new AOSmithUnknownError(`Received status code ${err.response.statusCode}`);
                }
            } else {
                throw new AOSmithUnknownError("Unknown error");
            }
        }

        const { body } = response;

        if (isFailedGraphQLResponse(body)) {
            const { errors } = body;
            if (errors.some((error) => error.extensions.code === "INVALID_CREDENTIALS")) {
                throw new AOSmithInvalidCredentialsError("Invalid email address or password");
            } else {
                throw new AOSmithUnknownError("Error: " + errors.map((error) => error.message).join(", "));
            }
        }

        return body.data;
    }

    private async login(): Promise<void> {
        const passcode = AOSmithAPIClient.buildPasscode(this.email, this.password);

        const data = await this.sendGraphQLQuery<LoginResponseData>(
            "query login($passcode: String) { login(passcode: $passcode) { user { tokens { accessToken idToken refreshToken } } } }",
            {
                passcode,
            },
            false,
        );

        this.token = data.login.user.tokens.accessToken;
    }

    async isEverythingOkay(): Promise<boolean> {
        const data = await this.sendGraphQLQuery<IsEverythingOkayResponseData>("{ status { isEverythingOkay } }");

        return data.status.isEverythingOkay;
    }

    async getDevices(): Promise<Device[]> {
        const data = await this.sendGraphQLQuery<GetDevicesResponseData>(DEVICES_GRAPHQL_QUERY, { forceUpdate: true });

        const nextGenHeatPumpDevices = data.devices.filter((device) => device.data.__typename === "NextGenHeatPump");

        return nextGenHeatPumpDevices;
    }

    private async getDeviceByJunctionId(junctionId: string): Promise<Device> {
        const devices = await this.getDevices();

        const device = devices.find((device) => device.junctionId === junctionId);
        if (!device) throw new AOSmithUnknownError("Device not found");

        return device;
    }

    async updateSetpoint(junctionId: string, setpoint: number): Promise<void> {
        if (setpoint < 95) throw new AOSmithInvalidParametersError("Setpoint is below the minimum");

        const device = await this.getDeviceByJunctionId(junctionId);

        if (setpoint > device.data.temperatureSetpointMaximum)
            throw new AOSmithInvalidParametersError("Setpoint is above the maximum");

        const data = await this.sendGraphQLQuery<UpdateSetpointResponseData>(
            "mutation updateSetpoint($junctionId: String!, $value: Int!) { updateSetpoint(junctionId: $junctionId, value: $value) }",
            {
                junctionId,
                value: setpoint,
            },
            true,
        );

        if (data.updateSetpoint !== true) throw new AOSmithUnknownError("Failed to update setpoint");
    }

    async updateMode(junctionId: string, mode: string, days?: number) {
        const device = await this.getDeviceByJunctionId(junctionId);

        const desiredMode = device.data.modes.find((availableMode) => availableMode.mode === mode);
        if (!desiredMode) throw new AOSmithInvalidParametersError("Invalid mode for this device");

        const daysRequired = desiredMode.controls === "SELECT_DAYS";
        if (daysRequired) {
            if (typeof days === "undefined") {
                days = 100;
            } else if (days <= 0 || days > 100) {
                throw new AOSmithInvalidParametersError("Invalid days selection");
            }
        } else if (typeof days !== "undefined") {
            throw new AOSmithInvalidParametersError("Days not supported for this operation mode");
        }

        const data = await this.sendGraphQLQuery<UpdateModeResponseData>(
            "mutation updateMode($junctionId: String!, $mode: ModeInput!) { updateMode(junctionId: $junctionId, mode: $mode) }",
            { junctionId, mode: daysRequired ? { mode, days } : { mode } },
        );

        if (!data.updateMode) throw new AOSmithUnknownError("Failed to update mode");
    }

    private async getEnergyUseDataByDSN(dsn: string, deviceType: string): Promise<EnergyUseData> {
        const data = await this.sendGraphQLQuery<GetEnergyUseDataResponseData>(
            "query getEnergyUseData($dsn: String!, $deviceType: DeviceType!) { getEnergyUseData(dsn: $dsn, deviceType: $deviceType) { average graphData { date kwh } lifetimeKwh startDate } }",
            {
                dsn,
                deviceType,
            },
            true,
        );

        return data.getEnergyUseData;
    }

    async getEnergyUseData(junctionId: string): Promise<EnergyUseData> {
        const device = await this.getDeviceByJunctionId(junctionId);

        return await this.getEnergyUseDataByDSN(device.dsn, device.deviceType);
    }
}
