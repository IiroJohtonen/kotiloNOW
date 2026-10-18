import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { ADMIN_EMAIL, call, login, MANAGER_EMAIL, startServer, type TestServer } from "./helpers.js";

describe("järjestelmän sanakirja", () => {
  let server: TestServer;
  let admin: string;
  let manager: string;

  before(async () => {
    server = await startServer();
    admin = await login(server, ADMIN_EMAIL);
    manager = await login(server, MANAGER_EMAIL);
  });

  after(() => server.stop());

  it("vain pääkäyttäjä näkee taulut, kentät ja tietueet", async () => {
    assert.equal((await call(server, manager, "GET", "/sys/tables")).status, 403);
    assert.equal((await call(server, manager, "GET", "/sys/tables/u_ticket")).status, 403);
    assert.equal((await call(server, manager, "GET", "/now/table/u_ticket")).status, 403);
    assert.equal((await call(server, manager, "PATCH", "/sys/tables/u_ticket", { label: "Tiketit" })).status, 403);
  });

  it("jokaisella taululla ja kentällä on sisäinen nimi", async () => {
    const tables = (await call(server, admin, "GET", "/sys/tables")).data as any[];
    const byPhysical = new Map(tables.map(table => [table.physicalName, table]));
    assert.equal(byPhysical.get("tickets").name, "u_ticket");
    assert.equal(byPhysical.get("users").name, "sys_user");
    assert.equal(byPhysical.get("sys_dictionary").name, "sys_dictionary");
    assert.ok(tables.every(table => /^[a-z][a-z0-9_]+$/.test(table.name) && table.fieldCount > 0));

    const ticket = (await call(server, admin, "GET", "/sys/tables/u_ticket")).data;
    const fields = new Map((ticket.fields as any[]).map(field => [field.columnName, field]));
    assert.equal(fields.get("id").element, "sys_id");
    assert.equal(fields.get("created_at").element, "sys_created_on");
    assert.deepEqual([fields.get("company_id").element, fields.get("company_id").type, fields.get("company_id").reference],
      ["company", "reference", "u_company"]);
    assert.equal(fields.get("assignee_id").element, "assigned_to");
    assert.equal(fields.get("assignee_id").reference, "sys_user");
    assert.equal(fields.get("status").type, "choice");
    assert.equal(fields.get("sensitive").type, "boolean");
    assert.ok((ticket.choices as any[]).some(choice => choice.element === "status" && choice.value === "waiting_manager" && choice.label === "Käsittelyssä"));

    const users = (await call(server, admin, "GET", "/sys/tables/sys_user")).data;
    assert.ok((users.fields as any[]).find(field => field.columnName === "password_hash").secret);
  });

  it("nimet muokataan ja muutos säilyy uudelleenkäynnistyksessä", async () => {
    const saved = await call(server, admin, "PATCH", "/sys/tables/u_ticket/fields/subject", { label: "Otsikko", labelEn: "Short description" });
    assert.equal(saved.status, 200);
    assert.equal((await call(server, admin, "PATCH", "/sys/tables/u_ticket", { label: "" })).status, 400);
    assert.equal((await call(server, admin, "PATCH", "/sys/tables/u_ticket/fields/status/choices/open", { label: "Saapunut" })).status, 200);
    await server.stop();
    server = await startServer({ dataDir: server.dataDir });
    admin = await login(server, ADMIN_EMAIL);
    const ticket = (await call(server, admin, "GET", "/sys/tables/u_ticket")).data;
    const subject = (ticket.fields as any[]).find(field => field.element === "subject");
    assert.deepEqual([subject.label, subject.labelEn], ["Otsikko", "Short description"]);
    assert.equal((ticket.choices as any[]).find(choice => choice.element === "status" && choice.value === "open").label, "Saapunut");
    const log = (await call(server, admin, "GET", "/audit")).data as any[];
    assert.ok(log.some(row => row.action === "dictionary_updated"));
  });

  it("tietueet haetaan sisäisillä nimillä koodatulla haulla", async () => {
    const all = await call(server, admin, "GET", "/now/table/u_ticket?sysparm_limit=100");
    assert.equal(all.status, 200);
    assert.ok(all.data.total > 0);
    assert.ok("sys_id" in all.data.result[0] && "company" in all.data.result[0] && !("company_id" in all.data.result[0]));

    const urgent = await call(server, admin, "GET",
      `/now/table/u_ticket?sysparm_query=${encodeURIComponent("priority=urgent^subjectLIKElattiakaivo^ORDERBYDESCsys_created_on")}`);
    assert.equal(urgent.status, 200);
    assert.ok(urgent.data.result.length > 0);
    assert.ok(urgent.data.result.every((row: any) => row.priority === "urgent" && /lattiakaivo/i.test(row.subject)));

    assert.equal((await call(server, admin, "GET", "/now/table/u_ticket?sysparm_query=company_id=demo-company")).status, 400);
    assert.equal((await call(server, admin, "GET", "/now/table/sys_user?sysparm_query=password_hashISNOTEMPTY")).status, 400);
    assert.equal((await call(server, admin, "GET", "/now/table/tickets")).status, 404);

    const users = await call(server, admin, "GET", "/now/table/sys_user");
    assert.ok(users.data.result.every((row: any) => !("password_hash" in row)));

    const one = await call(server, admin, "GET", `/now/table/u_ticket/${all.data.result[0].sys_id}`);
    assert.equal(one.data.result.sys_id, all.data.result[0].sys_id);
  });

  it("tietueen muokkaus tarkistaa tyypit, valinnat ja viittaukset", async () => {
    const detail = (await call(server, admin, "GET", "/sys/tables/u_ticket")).data;
    assert.equal(detail.table.keyField, "sys_id");
    assert.equal(detail.table.readOnly, false);
    assert.ok((detail.fields as any[]).find(field => field.element === "sys_created_on").readOnly);

    const ticket = (await call(server, admin, "GET", "/now/table/u_ticket?sysparm_limit=1")).data.result[0];
    const path = `/now/table/u_ticket/${ticket.sys_id}`;
    assert.equal((await call(server, manager, "PATCH", path, { priority: "low" })).status, 403);
    assert.equal((await call(server, admin, "PATCH", path, { priority: "huomenna" })).status, 400);
    assert.equal((await call(server, admin, "PATCH", path, { company: "ei-ole" })).status, 400);
    assert.equal((await call(server, admin, "PATCH", path, { due_date: "18.10.2026" })).status, 400);
    assert.equal((await call(server, admin, "PATCH", path, { sys_id: "uusi" })).status, 400);
    assert.equal((await call(server, admin, "PATCH", path, { subject: "" })).status, 200);

    const saved = await call(server, admin, "PATCH", path, { priority: "low", subject: "Muokattu", sensitive: false, due_date: "2026-12-01" });
    assert.equal(saved.status, 200);
    assert.deepEqual([saved.data.result.priority, saved.data.result.subject, saved.data.result.due_date], ["low", "Muokattu", "2026-12-01"]);
    assert.notEqual(saved.data.result.sys_updated_on, ticket.sys_updated_on);
    const opened = (await call(server, admin, "GET", `/tickets/${ticket.sys_id}`)).data.ticket;
    assert.equal(opened.subject, "Muokattu");

    assert.equal((await call(server, admin, "PATCH", "/now/table/sys_user/x", { name: "X" })).status, 403);
    assert.equal((await call(server, admin, "PATCH", "/now/table/sys_audit/x", { action: "x" })).status, 403);
    const log = (await call(server, admin, "GET", "/audit")).data as any[];
    assert.ok(log.some(row => row.action === "table_record_updated"));
  });

  it("uusi tietue saa tunnisteen ja pakolliset kentät tarkistetaan", async () => {
    assert.equal((await call(server, admin, "POST", "/now/table/u_apartment", { company: "demo-company" })).status, 400);
    const created = await call(server, admin, "POST", "/now/table/u_apartment",
      { company: "demo-company", apartment_number: "C 7", address: "Koivikkotie 12" });
    assert.equal(created.status, 201);
    assert.match(created.data.result.sys_id, /^apartment-/);
    const options = (await call(server, admin, "GET", "/sys/tables/u_apartment/options?q=C%207")).data as any[];
    assert.ok(options.some(option => option.value === created.data.result.sys_id && option.label === "C 7"));
  });
});
