import {Hono} from "hono";




const app = new Hono();

app.get("api/v1/health",(req)=>{
    return req.json({status:"ok"})
})




export default{
    port:Number(process.env.PORT) || 3000,
    fetch:app.fetch
}


