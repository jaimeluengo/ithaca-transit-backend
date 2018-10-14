// @flow
import { AppDevRouter } from 'appdev';
import type Request from 'express';
import LoggingUtils from '../utils/LoggingUtils';

class LoggingRouter extends AppDevRouter<Array<Object>> {
    constructor() {
        super('GET');
    }

    getPath(): string {
        return '/log/';
    }

    async content(req: Request): Promise<any> {
        // return content
    }
}

export default new LoggingRouter().router;
