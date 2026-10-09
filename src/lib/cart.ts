import {cookies} from "next/headers";
const COOKIE="sportpix_cart";
export async function getCartIds(){try{return JSON.parse((await cookies()).get(COOKIE)?.value||"[]").filter((v:unknown):v is string=>typeof v==="string")}catch{return[]}}
export async function setCartIds(ids:string[]){(await cookies()).set(COOKIE,JSON.stringify([...new Set(ids)]),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:60*60*24*30})}
export async function clearCart(){(await cookies()).delete(COOKIE)}
