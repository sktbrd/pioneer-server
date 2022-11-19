/*

    Pioneer REST endpoints



 */
let TAG = ' | API | '
// import jwt from 'express-jwt';
const pjson = require('../../package.json');
const log = require('@pioneer-platform/loggerdog')()
const {subscriber, publisher, redis} = require('@pioneer-platform/default-redis')
let connection  = require("@pioneer-platform/default-mongo")
const util = require('util')
import { recoverPersonalSignature } from 'eth-sig-util';
import { bufferToHex } from 'ethereumjs-util';
import {sign} from 'jsonwebtoken';

//TODO if no mongo use nedb?
//https://github.com/louischatriot/nedb

let config = {
    algorithms: ['HS256' as const],
    secret: 'shhhh', // TODO Put in process.env
};


let usersDB = connection.get('users')
let txsDB = connection.get('transactions')
let txsRawDB = connection.get('transactions-raw')
let devsDB = connection.get('developers')
let dapsDB = connection.get('dapps')

txsDB.createIndex({txid: 1}, {unique: true})
txsRawDB.createIndex({txhash: 1}, {unique: true})
// devsDB.createIndex({username: 1}, {unique: true})
devsDB.createIndex({publicAddress: 1}, {unique: true})
// dapsDB.createIndex({id: 1}, {unique: true})
//globals

const ADMIN_PUBLIC_ADDRESS = process.env['ADMIN_PUBLIC_ADDRESS']
if(!ADMIN_PUBLIC_ADDRESS) throw Error("Invalid ENV missing ADMIN_PUBLIC_ADDRESS")

//rest-ts
import { Body, Controller, Get, Post, Route, Tags, SuccessResponse, Query, Request, Response, Header } from 'tsoa';

import {
    Error,
    CreateAppBody
} from "@pioneer-platform/pioneer-types";


export class ApiError extends Error {
    private statusCode: number;
    constructor(name: string, statusCode: number, message?: string) {
        super(message);
        this.name = name;
        this.statusCode = statusCode;
    }
}

//route
@Tags('App Store Endpoints')
@Route('')
export class XDevsController extends Controller {

    /*
        read
    */

    @Get('/devs')
    public async listDevelopers() {
        let tag = TAG + " | listDeveloper | "
        try{
            let apps = devsDB.find()
            return(apps)
        }catch(e){
            let errorResp:Error = {
                success:false,
                tag,
                e
            }
            log.error(tag,"e: ",{errorResp})
            throw new ApiError("error",503,"error: "+e.toString());
        }
    }


    @Get('/auth/dev')
    public async getDevInfo(@Header('Authorization') authorization: string) {
        let tag = TAG + " | getDevInfo | "
        try{
            let authInfo = await redis.hgetall(authorization)
            log.info(tag,"authInfo: ",authInfo)
            log.info(tag,"Object: ",Object.keys(authInfo))
            if(!authInfo || Object.keys(authInfo).length === 0) throw Error("Token unknown or Expired!")
            let publicAddress = authInfo.publicAddress
            if(!publicAddress) throw Error("invalid auth key info!")



            let user = await devsDB.findOne({publicAddress})
            log.info(tag,"user: ",user)
            return(user);
        }catch(e){
            let errorResp:Error = {
                success:false,
                tag,
                e
            }
            log.error(tag,"e: ",{errorResp})
            throw new ApiError("error",503,"error: "+e.toString());
        }
    }



    //old
    /*
    Create

     */

    @Post('/devs/create')
    //CreateAppBody
    public async createDeveloper(@Header('Authorization') authorization: string,@Body() body: any): Promise<any> {
        let tag = TAG + " | createDeveloper | "
        try{
            log.info(tag,"body: ",body)
            let authInfo = await redis.hgetall(authorization)
            log.info(tag,"authInfo: ",authInfo)
            log.info(tag,"Object: ",Object.keys(authInfo))
            if(!authInfo || Object.keys(authInfo).length === 0) throw Error("Token unknown or Expired!")
            let publicAddress = authInfo.publicAddress
            if(!publicAddress) throw Error("invalid auth key info!")

            //get userInfo
            let userInfo = await usersDB.findOne({publicAddress})
            if(!userInfo) throw Error("First must register an account!")

            //body
            if(!body.email) throw Error("Developers must register an email!")
            if(!body.github) throw Error("Developers must register a github!")
            let devInfo = {
                verified:false,
                username:userInfo.username,
                publicAddress,
                email:body.email,
                github:body.github
            }
            let dev = await devsDB.insert(devInfo)

            return(dev);
        }catch(e){
            let errorResp:Error = {
                success:false,
                tag,
                e
            }
            log.error(tag,"e: ",{errorResp})
            throw new ApiError("error",503,"error: "+e.toString());
        }
    }



    /*
        Update MOTD
     */
    /** POST /users */
    @Post('/motd')
    //CreateAppBody
    public async updateMOTD(@Body() body: any): Promise<any> {
        let tag = TAG + " | updateMOTD | "
        try{
            log.info(tag,"body: ",body)
            let publicAddress = body.publicAddress
            let signature = body.signature
            let message = body.message
            if(!publicAddress) throw Error("Missing publicAddress!")
            if(!signature) throw Error("Missing signature!")
            if(!message) throw Error("Missing message!")

            //validate sig
            const msgBufferHex = bufferToHex(Buffer.from(message, 'utf8'));
            const addressFromSig = recoverPersonalSignature({
                data: msgBufferHex,
                sig: signature,
            });
            log.info(tag,"addressFromSig: ",addressFromSig)
            if(addressFromSig === ADMIN_PUBLIC_ADDRESS){
                //update MOTD
                let motd = message.split("MOTD:")
                motd = motd[1]
                log.info(tag,"motd: ",motd)
                await redis.set("MOTD",motd)
            } else {
                throw Error("Not Signed by admin! actual: "+addressFromSig+" expected: "+ADMIN_PUBLIC_ADDRESS)
            }


        }catch(e){
            let errorResp:Error = {
                success:false,
                tag,
                e
            }
            log.error(tag,"e: ",{errorResp})
            throw new ApiError("error",503,"error: "+e.toString());
        }
    }

    /*
        Verify

     */
    @Post('/devs/verify')
    //CreateAppBody
    public async verifyDeveloper(@Header('Authorization') authorization: string,@Body() body: any): Promise<any> {
        let tag = TAG + " | transactions | "
        try{
            log.info(tag,"body: ",body)
            let authInfo = await redis.hgetall(authorization)
            log.info(tag,"authInfo: ",authInfo)
            log.info(tag,"Object: ",Object.keys(authInfo))
            if(!authInfo || Object.keys(authInfo).length === 0) throw Error("Token unknown or Expired!")
            let publicAddress = authInfo.publicAddress
            if(!publicAddress) throw Error("invalid auth key info!")

            //verify address is admin
            if(publicAddress !== ADMIN_PUBLIC_ADDRESS) throw Error("Not an admin!")

            //verify action
            let signature = body.signature
            let message = body.message
            if(!publicAddress) throw Error("Missing publicAddress!")
            if(!signature) throw Error("Missing signature!")
            if(!message) throw Error("Missing message!")

            //validate sig
            const msgBufferHex = bufferToHex(Buffer.from(message, 'utf8'));
            const addressFromSig = recoverPersonalSignature({
                data: msgBufferHex,
                sig: signature,
            });
            log.info(tag,"addressFromSig: ",addressFromSig)
            if(addressFromSig === ADMIN_PUBLIC_ADDRESS){
                //update MOTD
                let devToVerify = message.split("VERIFY:")
                devToVerify = devToVerify[1]
                log.info(tag,"verify: ",devToVerify)

                //update
                let updateResult = await devsDB.update({username:devToVerify},{ $set:{isVerified: true }})
                log.info(tag,"updateResult: ",updateResult)
                return(updateResult);
            } else {
                throw Error("Not Signed by admin! actual: "+addressFromSig+" expected: "+ADMIN_PUBLIC_ADDRESS)
            }
        }catch(e){
            let errorResp:Error = {
                success:false,
                tag,
                e
            }
            log.error(tag,"e: ",{errorResp})
            throw new ApiError("error",503,"error: "+e.toString());
        }
    }








}
