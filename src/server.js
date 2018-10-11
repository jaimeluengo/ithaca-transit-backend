// @flow
import http from 'http';
import dotenv from 'dotenv';
import fs from 'fs';
import TCATUtils from './utils/TCATUtils';
import RealtimeFeedUtils from './utils/RealtimeFeedUtils';
import AllStopUtils from './utils/AllStopUtils';
import AlertsUtils from './utils/AlertsUtils';
import API from './Api';

TCATUtils.createRouteJson('routes.txt');
dotenv.config();

const port: number = parseInt(process.env.PORT) || 80;
const token = process.env.TOKEN;

writeToConfigFile() // make sure we write to config file first
    .then((success) => {
        RealtimeFeedUtils.start();
        AllStopUtils.start(); // needs to happen after we write to config file
        AlertsUtils.start();
    })
    .catch((err) => {
        throw err;
    });

const server = new API().getServer();

server.listen(port, '0.0.0.0');

function writeToConfigFile() {
    return new Promise(((resolve, reject) => {
        fs.writeFile('config.json', JSON.stringify({ basic_token: token }), (err) => {
            if (err) {
                reject(err);
            }
            resolve(true);
        });
    }));
}
