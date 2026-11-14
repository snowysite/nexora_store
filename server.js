import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.NEXORA_ADMIN_KEY || "change-this-admin-key-before-use";
const OPAY_NUMBER = process.env.OPAY_ACCOUNT_NUMBER || "7026041880";
const DB_FILE = path.join(__dirname, "data", "db.json");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const initial = { users: [], businesses: [], products: [], orders: [], subscriptions: [] };
function readDB() {
  try { return { ...initial, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) }; }
  catch { return structuredClone(initial); }
}
let db = readDB();
function saveDB() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
const sessions = new Map();
const id = () => crypto.randomUUID();
const hash = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const clean = (v, max=300) => typeof v === "string" ? v.trim().slice(0,max) : "";
const slugify = value => clean(value,100).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55);
const money = n => Math.round(Number(n || 0) * 100) / 100;
function tokenFor(userId, role="owner") {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { userId, role, expiresAt: Date.now() + 8*60*60*1000 });
  return token;
}
function session(req) {
  const raw = clean(req.headers.authorization, 200);
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
  const value = sessions.get(token);
  if (!value || value.expiresAt < Date.now()) { if(value) sessions.delete(token); return null; }
  return value;
}
function auth(req,res,next) {
  const s = session(req);
  if (!s || s.role !== "owner") return res.status(401).json({error:"Please sign in again."});
  req.session = s; next();
}
function admin(req,res,next) {
  const s = session(req);
  if (!s || s.role !== "admin") return res.status(401).json({error:"Administrator session expired."});
  req.session = s; next();
}
function ownerBusiness(userId) { return db.businesses.find(b => b.ownerId === userId) || null; }
function subscriptionFor(userId) { return db.subscriptions.find(s => s.ownerId === userId) || null; }
function subscriptionActive(userId) {
  const sub = subscriptionFor(userId);
  if (!sub || sub.status !== "active") return false;
  if (!sub.expiresAt || new Date(sub.expiresAt).getTime() <= Date.now()) {
    sub.status = "expired";
    const b = ownerBusiness(userId); if (b) b.status = "suspended";
    saveDB(); return false;
  }
  return true;
}
function publicBusiness(slug) {
  const business = db.businesses.find(b => b.slug === slug);
  if (!business || business.status !== "active" || !subscriptionActive(business.ownerId)) return null;
  return business;
}
app.get("/api/health", (_,res) => res.json({ok:true,service:"Nexora Business Hub"}));

app.post("/api/auth/register", (req,res) => {
  const name=clean(req.body?.name,100), email=clean(req.body?.email,160).toLowerCase(), password=String(req.body?.password||"");
  if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<8) return res.status(400).json({error:"Enter a name, valid email and password (at least 8 characters)."});
  if(db.users.some(u=>u.email===email)) return res.status(409).json({error:"An account with this email already exists."});
  const user={id:id(),name,email,passwordHash:hash(password),createdAt:new Date().toISOString()};
  db.users.push(user); saveDB();
  return res.status(201).json({token:tokenFor(user.id),user:{id:user.id,name,email}});
});
app.post("/api/auth/login", (req,res) => {
  const email=clean(req.body?.email,160).toLowerCase(), password=String(req.body?.password||"");
  const user=db.users.find(u=>u.email===email && u.passwordHash===hash(password));
  if(!user) return res.status(401).json({error:"Email or password is incorrect."});
  res.json({token:tokenFor(user.id),user:{id:user.id,name:user.name,email:user.email}});
});
app.post("/api/auth/logout", auth, (req,res) => {
  for(const [key,value] of sessions) if(value.userId===req.session.userId && value.role==="owner") sessions.delete(key);
  res.json({ok:true});
});
app.get("/api/me", auth, (req,res) => {
  const u=db.users.find(x=>x.id===req.session.userId);
  res.json({user:u?{id:u.id,name:u.name,email:u.email}:null,business:ownerBusiness(req.session.userId),subscription:subscriptionFor(req.session.userId)});
});
app.post("/api/business", auth, (req,res) => {
  if(ownerBusiness(req.session.userId)) return res.status(409).json({error:"Your account already has a store."});
  const name=clean(req.body?.name,120), slug=slugify(req.body?.slug||name);
  if(name.length<2 || slug.length<3) return res.status(400).json({error:"Enter a business name and a valid store address."});
  if(db.businesses.some(b=>b.slug===slug)) return res.status(409).json({error:"That store address is already taken."});
  const b={id:id(),ownerId:req.session.userId,name,slug,description:clean(req.body?.description,500),phone:clean(req.body?.phone,40),address:clean(req.body?.address,200),deliveryFee:Math.max(0,money(req.body?.deliveryFee)),deliveryEnabled:!!req.body?.deliveryEnabled,status:"active",createdAt:new Date().toISOString()};
  db.businesses.push(b); saveDB(); res.status(201).json({business:b});
});
app.get("/api/products", auth, (req,res) => {
  const b=ownerBusiness(req.session.userId); if(!b) return res.json({products:[]});
  res.json({products:db.products.filter(p=>p.businessId===b.id)});
});
app.post("/api/products", auth, (req,res) => {
  const b=ownerBusiness(req.session.userId); if(!b) return res.status(404).json({error:"Create your store first."});
  const name=clean(req.body?.name,120), price=money(req.body?.price);
  if(name.length<2 || price<0) return res.status(400).json({error:"Enter a menu item name and valid price."});
  const p={id:id(),businessId:b.id,name,description:clean(req.body?.description,400),price,category:clean(req.body?.category,60)||"Main dishes",imageUrl:clean(req.body?.imageUrl,1000),available:true,createdAt:new Date().toISOString()};
  db.products.push(p); saveDB(); res.status(201).json({product:p});
});
app.put("/api/products/:id", auth, (req,res) => {
  const b=ownerBusiness(req.session.userId), p=db.products.find(x=>x.id===req.params.id && x.businessId===b?.id);
  if(!p) return res.status(404).json({error:"Menu item not found."});
  for(const k of ["name","description","category","imageUrl"]) if(typeof req.body?.[k]==="string") p[k]=clean(req.body[k], k==="description"?400: k==="imageUrl"?1000:120);
  if(req.body?.price!==undefined) { const n=money(req.body.price); if(n<0) return res.status(400).json({error:"Price cannot be negative."}); p.price=n; }
  if(typeof req.body?.available==="boolean") p.available=req.body.available;
  saveDB(); res.json({product:p});
});
app.delete("/api/products/:id", auth, (req,res) => {
  const b=ownerBusiness(req.session.userId), i=db.products.findIndex(x=>x.id===req.params.id && x.businessId===b?.id);
  if(i<0) return res.status(404).json({error:"Menu item not found."});
  db.products.splice(i,1); saveDB(); res.json({deleted:true});
});
app.get("/api/orders", auth, (req,res) => {
  const b=ownerBusiness(req.session.userId); res.json({orders:b?db.orders.filter(o=>o.businessId===b.id).sort((a,c)=>c.createdAt.localeCompare(a.createdAt)):[]});
});
app.patch("/api/orders/:id", auth, (req,res) => {
  const b=ownerBusiness(req.session.userId), o=db.orders.find(x=>x.id===req.params.id && x.businessId===b?.id);
  if(!o) return res.status(404).json({error:"Order not found."});
  if(req.body?.paymentStatus==="paid") o.paymentStatus="paid";
  else if(typeof req.body?.status==="string" && ["accepted","preparing","ready","completed","cancelled"].includes(req.body.status)) o.status=req.body.status;
  else return res.status(400).json({error:"Invalid order update."});
  saveDB(); res.json({order:o});
});
app.get("/api/public/stores/:slug", (req,res) => {
  const b=publicBusiness(req.params.slug); if(!b) return res.status(404).json({error:"This store is unavailable or its subscription is inactive."});
  res.json({business:b,products:db.products.filter(p=>p.businessId===b.id && p.available)});
});
app.post("/api/public/stores/:slug/orders", (req,res) => {
  const b=publicBusiness(req.params.slug); if(!b) return res.status(404).json({error:"This store is unavailable or its subscription is inactive."});
  const customerName=clean(req.body?.customerName,120), customerPhone=clean(req.body?.customerPhone,40), orderType=req.body?.orderType==="delivery"?"delivery":"pickup";
  const itemsRaw=Array.isArray(req.body?.items)?req.body.items:[];
  if(customerName.length<2 || customerPhone.length<7 || !itemsRaw.length || itemsRaw.length>30) return res.status(400).json({error:"Enter your name, valid phone number and at least one item."});
  if(orderType==="delivery" && (!b.deliveryEnabled || clean(req.body?.deliveryAddress,300).length<5)) return res.status(400).json({error:"Delivery is unavailable or the address is incomplete."});
  const items=[];
  for(const raw of itemsRaw){
    const p=db.products.find(x=>x.id===raw.productId && x.businessId===b.id && x.available), qty=Math.floor(Number(raw.quantity));
    if(!p || qty<1 || qty>20) return res.status(400).json({error:"A selected menu item is unavailable or quantity is invalid."});
    items.push({productId:p.id,name:p.name,quantity:qty,unitPrice:p.price,lineTotal:money(p.price*qty)});
  }
  const subtotal=money(items.reduce((s,x)=>s+x.lineTotal,0)), deliveryFee=orderType==="delivery"?b.deliveryFee:0, total=money(subtotal+deliveryFee), trackingToken=crypto.randomBytes(20).toString("hex");
  const order={id:id(),businessId:b.id,trackingToken,orderNumber:"NX-"+Date.now().toString(36).toUpperCase(),customerName,customerPhone,orderType,deliveryAddress:orderType==="delivery"?clean(req.body?.deliveryAddress,300):"",notes:clean(req.body?.notes,400),items,subtotal,deliveryFee,total,status:"pending",paymentStatus:clean(req.body?.paymentReference,100)?"reference_submitted":"unpaid",paymentReference:clean(req.body?.paymentReference,100),createdAt:new Date().toISOString()};
  db.orders.push(order); saveDB(); res.status(201).json({orderNumber:order.orderNumber,trackingToken,total});
});
app.get("/api/public/orders/:token", (req,res) => {
  const o=db.orders.find(x=>x.trackingToken===req.params.token); if(!o) return res.status(404).json({error:"Order tracking link not found."});
  const b=db.businesses.find(x=>x.id===o.businessId);
  res.json({orderNumber:o.orderNumber,status:o.status,orderType:o.orderType,items:o.items,total:o.total,createdAt:o.createdAt,businessName:b?.name||"Restaurant",paymentStatus:o.paymentStatus,paymentReference:o.paymentReference});
});
app.get("/api/subscription", auth, (req,res) => { subscriptionActive(req.session.userId); res.json({subscription:subscriptionFor(req.session.userId)}); });
app.post("/api/subscription", auth, (req,res) => {
  const plan=req.body?.plan, ref=clean(req.body?.paymentReference,100);
  if(!["monthly","yearly"].includes(plan) || ref.length<4) return res.status(400).json({error:"Choose a plan and enter a valid transfer reference."});
  const sub={ownerId:req.session.userId,plan,amount:plan==="monthly"?4999:49990,paymentReference:ref,status:"pending",createdAt:new Date().toISOString()};
  const old=db.subscriptions.findIndex(s=>s.ownerId===req.session.userId); if(old>=0) db.subscriptions[old]=sub; else db.subscriptions.push(sub);
  saveDB(); res.status(201).json({subscription:sub});
});
app.post("/api/admin/login", (req,res) => {
  if(!req.body?.key || hash(req.body.key)!==hash(ADMIN_KEY)) return res.status(401).json({error:"Incorrect administrator key."});
  res.json({token:tokenFor("super-admin","admin")});
});
app.get("/api/admin/dashboard", admin, (_,res) => {
  const stores=db.businesses.map(b=>({business:b,subscription:subscriptionFor(b.ownerId)}));
  res.json({stores});
});
app.post("/api/admin/subscription", admin, (req,res) => {
  const sub=db.subscriptions.find(s=>s.ownerId===req.body?.ownerId);
  if(!sub || !["active","rejected"].includes(req.body?.status)) return res.status(404).json({error:"Subscription request not found or invalid action."});
  sub.status=req.body.status;
  if(sub.status==="active"){
    const days=sub.plan==="yearly"?365:30; sub.activatedAt=new Date().toISOString(); sub.expiresAt=new Date(Date.now()+days*86400000).toISOString();
    const b=ownerBusiness(sub.ownerId); if(b) b.status="active";
  } else sub.rejectedAt=new Date().toISOString();
  saveDB(); res.json({updated:true,subscription:sub});
});
app.post("/api/admin/store-status", admin, (req,res) => {
  const b=db.businesses.find(x=>x.id===req.body?.businessId);
  if(!b || !["active","suspended"].includes(req.body?.status)) return res.status(404).json({error:"Store not found or invalid status."});
  b.status=req.body.status; saveDB(); res.json({updated:true,status:b.status});
});
app.get("*", (_,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, () => console.log(`Nexora Business Hub running at http://localhost:${PORT}`));
