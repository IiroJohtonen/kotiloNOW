import { type FormEvent, useEffect, useState } from "react";
import { language, t } from "../i18n";
import { api, errorMessage } from "../session";

type SysTable = {
  name: string;
  physicalName: string;
  label: string;
  labelEn: string;
  description: string;
  isSystem: number | boolean;
  readOnly?: boolean;
  keyField?: string | null;
  displayField?: string | null;
  fieldCount?: number;
  rowCount?: number;
};

type SysField = {
  element: string;
  columnName: string;
  label: string;
  labelEn: string;
  description: string;
  type: string;
  reference: string | null;
  mandatory: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
  secret: boolean;
  readOnly: boolean;
};

type SysChoice = { element: string; value: string; label: string; labelEn: string; sequence: number };

type TableDetail = { table: SysTable; fields: SysField[]; choices: SysChoice[] };

type Records = { result: Record<string, unknown>[]; total: number; limit: number; offset: number };

const labelOf = (item: { label: string; labelEn: string }) => (language === "en" ? item.labelEn : item.label);

const typeLabels: Record<string, string> = {
  sys_id: t("Tunniste"),
  string: t("Teksti"),
  integer: t("Kokonaisluku"),
  decimal: t("Desimaaliluku"),
  boolean: t("Kyllä/ei"),
  glide_date: t("Päivämäärä"),
  glide_date_time: t("Päivämäärä ja aika"),
  reference: t("Viittaus"),
  choice: t("Valinta"),
  json: "JSON"
};

// Taulut ja kentät ServiceNow'n tapaan: jokaisen taulun ja kentän sisäinen nimi, nimet suomeksi ja
// englanniksi, tyyppi, viittaukset ja valinnat sekä taulun tietueet sisäisillä nimillä. Vain pääkäyttäjälle.
export function DictionarySettings() {
  const [tables, setTables] = useState<SysTable[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api<SysTable[]>("/sys/tables")
      .then(setTables)
      .catch(() => setError(t("Taulujen lataus epäonnistui.")));
  }, []);

  const searchText = search.trim().toLowerCase();
  const visible = tables.filter(table =>
    (showSystem || !table.isSystem || searchText)
    && (!searchText || [table.name, table.physicalName, table.label, table.labelEn].some(value => value.toLowerCase().includes(searchText))));

  if (selected) {
    return (
      <TableView
        name={selected}
        onBack={() => setSelected(null)}
        onOpen={setSelected}
        onRenamed={updated => setTables(list => list.map(table => (table.name === updated.name ? { ...table, ...updated } : table)))}
      />
    );
  }

  return (
    <div className="settings-card dictionary" id="section-dictionary">
      <h2>{t("Taulut ja kentät")}</h2>
      <p className="muted">
        {t("Jokaisella taululla ja kentällä on sisäinen nimi, jolla siihen viitataan rajapinnassa ja hauissa (esim. u_ticket.assigned_to). Nimet ja kuvaukset voi muuttaa, sisäinen nimi pysyy samana.")}
      </p>
      <div className="dictionary-toolbar">
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder={t("Hae taulua nimellä tai sisäisellä nimellä")}
          aria-label={t("Hae taulua")}
        />
        <label className="dictionary-check">
          <input type="checkbox" checked={showSystem} onChange={event => setShowSystem(event.target.checked)} />
          <span>{t("Näytä järjestelmätaulut (sys_)")}</span>
        </label>
      </div>
      {error && <p className="send-error">{error}</p>}
      <div className="table-card">
        <table className="data-table dictionary-table">
          <thead>
            <tr>
              <th>{t("Nimi")}</th>
              <th>{t("Sisäinen nimi")}</th>
              <th>{t("Kenttiä")}</th>
              <th>{t("Tietueita")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(table => (
              <tr
                key={table.name}
                className="clickable"
                tabIndex={0}
                onClick={() => setSelected(table.name)}
                onKeyDown={event => { if (event.key === "Enter") setSelected(table.name); }}
              >
                <td>
                  <strong>{labelOf(table)}</strong>
                  {table.description && <small className="dictionary-description">{table.description}</small>}
                </td>
                <td><code>{table.name}</code></td>
                <td>{table.fieldCount}</td>
                <td>{table.rowCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && !error && <div className="empty">{tables.length ? t("Ei hakua vastaavia tauluja.") : t("Ladataan…")}</div>}
      </div>
    </div>
  );
}

function TableView({ name, onBack, onOpen, onRenamed }: {
  name: string;
  onBack: () => void;
  onOpen: (name: string) => void;
  onRenamed: (table: Pick<SysTable, "name" | "label" | "labelEn" | "description">) => void;
}) {
  const [detail, setDetail] = useState<TableDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"fields" | "records">("fields");
  const [editingTable, setEditingTable] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setTab("fields");
    setEditing(null);
    setEditingTable(false);
    api<TableDetail>(`/sys/tables/${encodeURIComponent(name)}`)
      .then(setDetail)
      .catch(() => setError(t("Taulun lataus epäonnistui.")));
  }, [name]);

  if (!detail) {
    return (
      <div className="settings-card dictionary">
        <button type="button" className="back-link" onClick={onBack}>{t("← Kaikki taulut")}</button>
        <div className="empty">{error || t("Ladataan…")}</div>
      </div>
    );
  }

  const { table, fields, choices } = detail;

  return (
    <div className="settings-card dictionary" id="section-dictionary">
      <button type="button" className="back-link" onClick={onBack}>{t("← Kaikki taulut")}</button>
      {editingTable ? (
        <LabelForm
          path={`/sys/tables/${encodeURIComponent(table.name)}`}
          item={table}
          withDescription
          onCancel={() => setEditingTable(false)}
          onSaved={saved => {
            setDetail({ ...detail, table: { ...table, ...saved } });
            onRenamed({ ...saved, name: table.name });
            setEditingTable(false);
          }}
        />
      ) : (
        <div className="dictionary-head">
          <div>
            <h2>{labelOf(table)}</h2>
            <p className="muted">
              {t("Sisäinen nimi")} <code>{table.name}</code> · {t("Tietokannan taulu")} <code>{table.physicalName}</code>
            </p>
            {table.description && <p>{table.description}</p>}
          </div>
          <button type="button" className="secondary" onClick={() => setEditingTable(true)}>{t("Muokkaa")}</button>
        </div>
      )}

      <div className="card-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "fields"} className={tab === "fields" ? "active" : ""} onClick={() => setTab("fields")}>
          {t("Kentät")} ({fields.length})
        </button>
        <button role="tab" aria-selected={tab === "records"} className={tab === "records" ? "active" : ""} onClick={() => setTab("records")}>
          {t("Tietueet")}
        </button>
      </div>

      {tab === "fields" ? (
        <div className="table-card">
          <table className="data-table dictionary-table">
            <thead>
              <tr>
                <th>{t("Nimi")}</th>
                <th>{t("Sisäinen nimi")}</th>
                <th>{t("Tyyppi")}</th>
                <th>{t("Tietokannan sarake")}</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(field => {
                const fieldChoices = choices.filter(choice => choice.element === field.element);
                return editing === field.element ? (
                  <tr key={field.element}>
                    <td colSpan={4}>
                      <LabelForm
                        path={`/sys/tables/${encodeURIComponent(table.name)}/fields/${encodeURIComponent(field.element)}`}
                        item={field}
                        withDescription
                        onCancel={() => setEditing(null)}
                        onSaved={saved => {
                          setDetail({ ...detail, fields: fields.map(item => (item.element === field.element ? { ...item, ...saved } : item)) });
                          setEditing(null);
                        }}
                      />
                      {fieldChoices.length > 0 && (
                        <ChoiceList
                          table={table.name}
                          choices={fieldChoices}
                          onSaved={saved => setDetail({
                            ...detail,
                            choices: choices.map(choice => (choice.element === saved.element && choice.value === saved.value ? { ...choice, ...saved } : choice))
                          })}
                        />
                      )}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={field.element}
                    className="clickable"
                    tabIndex={0}
                    title={t("Muokkaa kentän nimeä")}
                    onClick={() => setEditing(field.element)}
                    onKeyDown={event => { if (event.key === "Enter") setEditing(field.element); }}
                  >
                    <td>
                      <strong>{labelOf(field)}</strong>
                      {field.mandatory && <span className="dictionary-flag" title={t("Pakollinen")}>*</span>}
                      {field.description && <small className="dictionary-description">{field.description}</small>}
                      {fieldChoices.length > 0 && (
                        <small className="dictionary-description">
                          {fieldChoices.map(choice => `${choice.value} = ${labelOf(choice)}`).join(" · ")}
                        </small>
                      )}
                    </td>
                    <td><code>{field.element}</code></td>
                    <td>
                      {typeLabels[field.type] ?? field.type}
                      {field.reference && (
                        <>
                          {" → "}
                          <button
                            type="button"
                            className="link-button"
                            onClick={event => { event.stopPropagation(); onOpen(field.reference!); }}
                          >
                            <code>{field.reference}</code>
                          </button>
                        </>
                      )}
                      {field.secret && <small className="dictionary-description">{t("Salainen: arvoa ei näytetä")}</small>}
                    </td>
                    <td><code>{field.columnName}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <RecordList table={table} fields={fields} choices={choices} />
      )}
    </div>
  );
}

function LabelForm({ path, item, withDescription, onCancel, onSaved }: {
  path: string;
  item: { label: string; labelEn: string; description?: string };
  withDescription?: boolean;
  onCancel: () => void;
  onSaved: (saved: { label: string; labelEn: string; description: string }) => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [labelEn, setLabelEn] = useState(item.labelEn);
  const [description, setDescription] = useState(item.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = withDescription ? { label, labelEn, description } : { label, labelEn };
      const saved = await api<{ label: string; labelEn: string; description?: string }>(path, { method: "PATCH", body: JSON.stringify(body) });
      onSaved({ label: saved.label, labelEn: saved.labelEn, description: saved.description ?? description });
    } catch (caught) {
      setError(errorMessage(caught, t("Tallennus epäonnistui.")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="ticket-form dictionary-form" onSubmit={submit}>
      <label>
        <span>{t("Nimi suomeksi")}</span>
        <input value={label} onChange={event => setLabel(event.target.value)} maxLength={80} required />
      </label>
      <label>
        <span>{t("Nimi englanniksi")}</span>
        <input value={labelEn} onChange={event => setLabelEn(event.target.value)} maxLength={80} required />
      </label>
      {withDescription && (
        <label>
          <span>{t("Kuvaus")}</span>
          <textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={1000} rows={2} />
        </label>
      )}
      {error && <p className="send-error">{error}</p>}
      <div className="draft-actions">
        <button className="primary" type="submit" disabled={saving}>{saving ? t("Tallennetaan…") : t("Tallenna")}</button>
        <button type="button" className="secondary" onClick={onCancel}>{t("Peruuta")}</button>
      </div>
    </form>
  );
}

function ChoiceList({ table, choices, onSaved }: {
  table: string;
  choices: SysChoice[];
  onSaved: (choice: Pick<SysChoice, "element" | "value" | "label" | "labelEn">) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="dictionary-choices">
      <h3>{t("Valinnat")}</h3>
      <ul>
        {choices.map(choice => (
          <li key={choice.value}>
            {editing === choice.value ? (
              <LabelForm
                path={`/sys/tables/${encodeURIComponent(table)}/fields/${encodeURIComponent(choice.element)}/choices/${encodeURIComponent(choice.value)}`}
                item={choice}
                onCancel={() => setEditing(null)}
                onSaved={saved => {
                  onSaved({ element: choice.element, value: choice.value, label: saved.label, labelEn: saved.labelEn });
                  setEditing(null);
                }}
              />
            ) : (
              <button type="button" className="link-button" onClick={() => setEditing(choice.value)} title={t("Muokkaa valinnan nimeä")}>
                <code>{choice.value}</code> = {labelOf(choice)}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const PAGE_SIZE = 20;

// Taulun tietueet sisäisillä kenttänimillä. Haku on ServiceNow'n koodattu haku, esim. status=open^priority=urgent.
// Muokattavan taulun rivi avaa tietueen lomakkeeseen, ja Uusi tietue luo rivin.
function RecordList({ table, fields, choices }: { table: SysTable; fields: SysField[]; choices: SysChoice[] }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [records, setRecords] = useState<Records | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  // null = lomake kiinni, "new" = uusi tietue, muuten muokattava tietue.
  const [editing, setEditing] = useState<Record<string, unknown> | "new" | null>(null);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    setError("");
    const params = new URLSearchParams({ sysparm_query: query, sysparm_limit: String(PAGE_SIZE), sysparm_offset: String(offset) });
    api<Records>(`/now/table/${encodeURIComponent(table.name)}?${params}`)
      .then(setRecords)
      .catch(caught => {
        setRecords(null);
        setError(errorMessage(caught, t("Tietueiden lataus epäonnistui.")));
      });
  }, [table.name, query, offset, reload]);

  const columns = fields.filter(field => !field.secret);
  const editable = !table.readOnly && !!table.keyField;

  if (editing) {
    return (
      <RecordForm
        table={table}
        fields={fields}
        choices={choices}
        record={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={created => {
          setSavedMessage(created ? t("Tietue luotu.") : t("Muutokset tallennettu."));
          setEditing(null);
          setReload(count => count + 1);
        }}
      />
    );
  }

  return (
    <div className="dictionary-records">
      <form
        className="dictionary-toolbar"
        onSubmit={event => {
          event.preventDefault();
          setOffset(0);
          setQuery(draft.trim());
        }}
      >
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder="status=open^priorityLIKEurg^ORDERBYDESCsys_created_on"
          aria-label={t("Koodattu haku")}
          className="dictionary-query"
        />
        <button className="primary" type="submit">{t("Hae")}</button>
        {editable && (
          <button type="button" className="secondary" onClick={() => { setSavedMessage(""); setEditing("new"); }}>
            {t("Uusi tietue")}
          </button>
        )}
      </form>
      <p className="muted dictionary-help">
        {t("Ehdot erotetaan merkillä ^. Vertailut: = != > < LIKE STARTSWITH ISEMPTY ISNOTEMPTY, järjestys ORDERBY tai ORDERBYDESC ja kentän sisäinen nimi.")}
        {" "}
        {editable ? t("Avaa tietue muokattavaksi painamalla riviä.") : t("Tämän taulun tietueita ei voi muokata täällä.")}
      </p>
      {savedMessage && <p className="dictionary-saved">{savedMessage}</p>}
      {error && <p className="send-error">{error}</p>}
      {records && (
        <>
          <div className="table-card">
            <table className="data-table dictionary-table dictionary-records-table">
              <thead>
                <tr>
                  {columns.map(field => (
                    <th key={field.element} title={labelOf(field)}>{field.element}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.result.map((record, index) => (
                  <tr
                    key={String(record[table.keyField ?? "sys_id"] ?? index)}
                    className={editable ? "clickable" : undefined}
                    tabIndex={editable ? 0 : undefined}
                    title={editable ? t("Muokkaa tietuetta") : undefined}
                    onClick={editable ? () => { setSavedMessage(""); setEditing(record); } : undefined}
                    onKeyDown={editable ? event => { if (event.key === "Enter") { setSavedMessage(""); setEditing(record); } } : undefined}
                  >
                    {columns.map(field => (
                      <td key={field.element}>{formatValue(record[field.element])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {records.result.length === 0 && <div className="empty">{t("Ei tietueita.")}</div>}
          </div>
          <div className="pager">
            <button type="button" className="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}>
              {t("← Edellinen")}
            </button>
            <span>
              {records.total === 0 ? "0" : `${offset + 1}–${Math.min(offset + PAGE_SIZE, records.total)}`} / {records.total}
            </span>
            <button
              type="button"
              className="secondary"
              disabled={offset + PAGE_SIZE >= records.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {t("Seuraava →")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Pitkät tekstikentät näytetään monirivisinä.
const LONG_TEXT = new Set(["body", "content", "summary", "description", "draft", "note", "details", "message", "ai_reason", "decision_note", "template"]);

type FormValue = string | boolean;

// Tietokannan arvo lomakkeen kentäksi: kyllä/ei valintaruuduksi ja aikaleima paikalliseksi ajaksi.
function toFormValue(field: SysField, value: unknown): FormValue {
  if (field.type === "boolean") return value === 1 || value === true || value === "1";
  if (value === null || value === undefined) return "";
  if (field.type === "glide_date_time") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }
  return String(value);
}

function fromFormValue(field: SysField, value: FormValue): unknown {
  if (field.type === "boolean") return Boolean(value);
  if (field.type === "glide_date_time" && value) {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? value : date.toISOString();
  }
  return value;
}

function RecordForm({ table, fields, choices, record, onClose, onSaved }: {
  table: SysTable;
  fields: SysField[];
  choices: SysChoice[];
  record: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: (created: boolean) => void;
}) {
  const creating = record === null;
  // Uudessa tietueessa ei näytetä kenttiä, jotka järjestelmä täyttää (tunniste, luonti- ja päivitysaika).
  const visible = fields.filter(field => !field.secret
    && (!creating || !field.readOnly || (field.primaryKey && field.type !== "sys_id")));
  const initial = Object.fromEntries(visible.map(field => [
    field.element,
    creating ? (field.type === "boolean" ? field.defaultValue === "1" : "") : toFormValue(field, record[field.element])
  ])) as Record<string, FormValue>;
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const keyValue = record && table.keyField ? String(record[table.keyField]) : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    const editableFields = visible.filter(field => !field.readOnly || (creating && field.primaryKey));
    const changed = editableFields.filter(field => creating ? values[field.element] !== "" : values[field.element] !== initial[field.element]);
    if (!creating && changed.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = Object.fromEntries(changed.map(field => [field.element, fromFormValue(field, values[field.element])]));
      await api(creating
        ? `/now/table/${encodeURIComponent(table.name)}`
        : `/now/table/${encodeURIComponent(table.name)}/${encodeURIComponent(keyValue)}`, {
        method: creating ? "POST" : "PATCH",
        body: JSON.stringify(body)
      });
      onSaved(creating);
    } catch (caught) {
      setError(errorMessage(caught, t("Tallennus epäonnistui.")));
    } finally {
      setSaving(false);
    }
  }

  const set = (element: string, value: FormValue) => setValues(current => ({ ...current, [element]: value }));

  return (
    <form className="ticket-form dictionary-record-form" onSubmit={submit}>
      <div className="dictionary-head">
        <div>
          <h3>{creating ? t("Uusi tietue") : t("Muokkaa tietuetta")}</h3>
          {!creating && <p className="muted"><code>{table.name}</code> · <code>{keyValue}</code></p>}
        </div>
        <button type="button" className="back-link" onClick={onClose}>{t("← Takaisin tietueisiin")}</button>
      </div>
      <div className="dictionary-record-fields">
        {visible.map(field => {
          const value = values[field.element];
          const locked = field.readOnly && !(creating && field.primaryKey);
          const fieldChoices = choices.filter(choice => choice.element === field.element);
          const id = `record-${field.element}`;
          const caption = (
            <span>
              {labelOf(field)}{field.mandatory && !locked && field.defaultValue === null ? " *" : ""} <code>{field.element}</code>
            </span>
          );
          if (field.type === "boolean") {
            return (
              <label key={field.element} className="dictionary-check dictionary-record-check">
                <input type="checkbox" checked={Boolean(value)} disabled={locked} onChange={event => set(field.element, event.target.checked)} />
                {caption}
              </label>
            );
          }
          let input;
          if (locked) {
            input = <input id={id} value={String(value) || "–"} disabled />;
          } else if (fieldChoices.length > 0) {
            const options = fieldChoices.some(choice => choice.value === value) || value === "" ? fieldChoices
              : [...fieldChoices, { element: field.element, value: String(value), label: String(value), labelEn: String(value), sequence: 999 }];
            input = (
              <select id={id} value={String(value)} onChange={event => set(field.element, event.target.value)}>
                <option value="">{field.mandatory ? t("Valitse") : "–"}</option>
                {options.map(choice => <option key={choice.value} value={choice.value}>{labelOf(choice)} ({choice.value})</option>)}
              </select>
            );
          } else if (field.type === "reference" && field.reference) {
            input = <ReferenceInput id={id} table={field.reference} value={String(value)} onChange={next => set(field.element, next)} />;
          } else if (field.type === "json" || LONG_TEXT.has(field.element) || String(value).length > 80) {
            input = <textarea id={id} value={String(value)} rows={field.type === "json" ? 4 : 3} onChange={event => set(field.element, event.target.value)} />;
          } else {
            const type = field.type === "glide_date" ? "date"
              : field.type === "glide_date_time" ? "datetime-local"
              : field.type === "integer" || field.type === "decimal" ? "number" : "text";
            input = (
              <input
                id={id}
                type={type}
                step={field.type === "decimal" ? "any" : undefined}
                value={String(value)}
                onChange={event => set(field.element, event.target.value)}
              />
            );
          }
          return (
            <label key={field.element} htmlFor={id}>
              {caption}
              {input}
            </label>
          );
        })}
      </div>
      {error && <p className="send-error">{error}</p>}
      <div className="draft-actions">
        <button className="primary" type="submit" disabled={saving}>
          {saving ? t("Tallennetaan…") : creating ? t("Luo tietue") : t("Tallenna")}
        </button>
        <button type="button" className="secondary" onClick={onClose}>{t("Peruuta")}</button>
      </div>
    </form>
  );
}

// Viittauskenttä: kirjoitetaan tunniste tai haetaan tietue nimellä; vaihtoehdot tulevat viitatusta taulusta.
function ReferenceInput({ id, table, value, onChange }: { id: string; table: string; value: string; onChange: (value: string) => void }) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const listId = `${id}-options`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      api<{ value: string; label: string }[]>(`/sys/tables/${encodeURIComponent(table)}/options?q=${encodeURIComponent(value)}`)
        .then(setOptions)
        .catch(() => setOptions([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [table, value]);

  const selected = options.find(option => option.value === value);
  return (
    <>
      <input id={id} list={listId} value={value} onChange={event => onChange(event.target.value)} placeholder={t("Hae nimellä tai tunnisteella")} />
      <datalist id={listId}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </datalist>
      <small className="dictionary-description">
        → <code>{table}</code>{selected && selected.label !== selected.value ? ` · ${selected.label}` : ""}
      </small>
    </>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "–";
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
