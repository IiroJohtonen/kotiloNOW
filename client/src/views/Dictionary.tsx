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
        <RecordList table={table.name} fields={fields} />
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
function RecordList({ table, fields }: { table: string; fields: SysField[] }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [records, setRecords] = useState<Records | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    const params = new URLSearchParams({ sysparm_query: query, sysparm_limit: String(PAGE_SIZE), sysparm_offset: String(offset) });
    api<Records>(`/now/table/${encodeURIComponent(table)}?${params}`)
      .then(setRecords)
      .catch(caught => {
        setRecords(null);
        setError(errorMessage(caught, t("Tietueiden lataus epäonnistui.")));
      });
  }, [table, query, offset]);

  const columns = fields.filter(field => !field.secret);

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
      </form>
      <p className="muted dictionary-help">
        {t("Ehdot erotetaan merkillä ^. Vertailut: = != > < LIKE STARTSWITH ISEMPTY ISNOTEMPTY, järjestys ORDERBY tai ORDERBYDESC ja kentän sisäinen nimi.")}
      </p>
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
                  <tr key={String(record.sys_id ?? index)}>
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

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "–";
  const text = String(value);
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}
