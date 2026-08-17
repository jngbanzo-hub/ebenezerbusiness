import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {consistencyAlerts,deduplicateAlerts,qrStockAlert,sourceUnavailable} from "./admin-alert-rules.ts";
import {determineParcelConsistency} from "./admin-parcel-consistency.ts";
import {getQrStockAlert} from "../features/qr-label/qr-stock-alert.ts";

const service=readFileSync(new URL("./admin-alert-center.ts",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/admin/alerts/route.ts",import.meta.url),"utf8");
const ui=readFileSync(new URL("../features/admin/admin-alert-center.tsx",import.meta.url),"utf8");

test("seuils QR 200 et 100 réutilisés sans réservation",()=>{const alerts=(value)=>qrStockAlert(value,"now",getQrStockAlert(value));assert.equal(alerts(500).length,0);assert.equal(alerts(201).length,0);assert.equal(alerts(200)[0].level,"ATTENTION");assert.equal(alerts(150)[0].level,"ATTENTION");assert.equal(alerts(101)[0].level,"ATTENTION");assert.equal(alerts(100)[0].level,"IMPORTANT");assert.equal(alerts(80)[0].level,"IMPORTANT");assert.equal(alerts(0)[0].level,"IMPORTANT");});
test("vraie contradiction conservée",()=>{const state=determineParcelConsistency({manifest:[{agency:"FIH",rowNumber:1}],qr:[{agency:"FIH"}],storage:[{agency:"LSHI",status:"AVAILABLE"}]});const alerts=consistencyAlerts("X",state,"now");assert.equal(alerts[0].title,"INCOHÉRENCE À VÉRIFIER");});
test("correspondances MANIFESTE multiples restent INFO",()=>{const state=determineParcelConsistency({manifest:[{agency:"FIH",rowNumber:1},{agency:"LSHI",rowNumber:2},{agency:"KLZ",rowNumber:3}],qr:[],storage:[]});const alerts=consistencyAlerts("AT00126",state,"now");assert.equal(alerts[0].level,"INFO");assert.equal(alerts[0].title,"PLUSIEURS CORRESPONDANCES MANIFESTE TROUVÉES");});
test("indisponibilité isolée et déduplication",()=>{const alert=sourceUnavailable("DÉPENSES","now");assert.equal(deduplicateAlerts([alert,alert]).length,1);assert.match(alert.description,/autres catégories restent affichées/);});
test("service parallèle, lecture seule et aucune Caisse COO",()=>{assert.match(service,/Promise\.all/);assert.match(service,/readQrStockSummary|readAdminPayments|readAdminExpenses|readAdminAlertCenter|createServerCashDashboardSource/);assert.doesNotMatch(service,/insert\(|update\(|delete\(|upsert\(/);assert.doesNotMatch(service,/cash.*COO/i);});
test("API Admin limitée à la lecture et au marquage lu, avec filtres complets",()=>{assert.match(route,/authorizeAdminRequest/g);assert.match(route,/export async function GET/);assert.match(route,/export async function POST/);assert.match(route,/MARK_READ/);assert.match(route,/MARK_ALL_READ/);assert.doesNotMatch(route,/PUT|PATCH|DELETE/);for(const label of ["INFO","ATTENTION","IMPORTANT","COO","FIH","LSHI","KLZ","QR","STOCKAGE","ENCAISSEMENTS","CAISSE","DÉPENSES","COHÉRENCE COLIS"])assert.match(ui,new RegExp(label));});
