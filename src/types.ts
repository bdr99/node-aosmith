export interface FailedGraphQLResponse {
    errors: {
        message: string;
        locations: {
            line: number;
            column: number;
        }[];
        path: string[];
        extensions: {
            code: string;
            exception: {
                message: string;
            };
        };
    }[];
}

export interface SuccessfulGraphQLResponse<T> {
    data: T;
}

export type GraphQLResponse<T> = FailedGraphQLResponse | SuccessfulGraphQLResponse<T>;

export function isFailedGraphQLResponse<T>(response: GraphQLResponse<T>): response is FailedGraphQLResponse {
    return "errors" in response;
}

export interface IsEverythingOkayResponseData {
    status: {
        isEverythingOkay: boolean;
    };
}

export interface LoginResponseData {
    login: {
        user: {
            tokens: {
                accessToken: string;
                idToken: string;
                refreshToken: string;
            };
        };
    };
}

export interface GetDevicesResponseData {
    devices: Device[];
}

export interface Device {
    brand: string;
    model: string;
    deviceType: string;
    dsn: string;
    junctionId: string;
    name: string;
    serial: string;
    install: {
        location: string;
    };
    data: {
        __typename: string;
        temperatureSetpoint: number;
        temperatureSetpointPending: boolean;
        temperatureSetpointPrevious: number;
        temperatureSetpointMaximum: number;
        modes: Mode[];
        isOnline: boolean;

        // specific to __typename === "NextGenHeatPump"
        firmwareVersion: string;
        hotWaterStatus: "LOW" | "MEDIUM" | "HIGH";
        mode: string;
        modePending: boolean;
        vacationModeRemainingDays: number;
        electricModeRemainingDays: number;
    };
}

interface Mode {
    mode: string;
    controls: string | null;
}

export interface GetEnergyUseDataResponseData {
    getEnergyUseData: EnergyUseData;
}

export interface EnergyUseData {
    average: number;
    graphData: {
        date: string;
        kwh: number;
    }[];
    lifetimeKwh: number;
    startDate: string;
}

export interface UpdateSetpointResponseData {
    updateSetpoint: boolean;
}

export interface UpdateModeResponseData {
    updateMode: boolean;
}
