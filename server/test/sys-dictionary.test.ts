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
});
