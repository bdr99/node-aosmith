export class AOSmithInvalidCredentialsError extends Error {
    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, AOSmithInvalidCredentialsError.prototype);
    }
}

export class AOSmithInvalidParametersError extends Error {
    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, AOSmithInvalidParametersError.prototype);
    }
}

export class AOSmithUnknownError extends Error {
    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, AOSmithUnknownError.prototype);
    }
}
