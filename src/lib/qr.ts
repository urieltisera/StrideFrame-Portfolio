import crypto from "node:crypto";
export function publicBaseUrl(){const value=process.env.PUBLIC_BASE_URL;if(!value)throw new Error("PUBLIC_BASE_URL is required");return value.replace(/\/$/,"")}
export function newQrCode(){return crypto.randomBytes(12).toString("base64url")}
export function qrUrl(code:string){return `${publicBaseUrl()}/q/${code}`}
export function publicProfileUrl(slug:string){return `${publicBaseUrl()}/p/${encodeURIComponent(slug)}`}
