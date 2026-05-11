import React, { useEffect, useRef, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import jsPDF from "jspdf";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { FileOpener } from "@capacitor-community/file-opener";
import { api } from "../../lib/api";
import { ScreenHeader, PageContainer, Spinner, Empty, Toast, useToast } from "../ui/Shell";
import { fmtMoney, fmtHours, fmtDateShort, durationHours } from "../../lib/format";
import { rechartsTooltipProps } from "../../lib/rechartsTooltipProps";
import { Download, FileText } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { TimeEntryEditorSheet } from "./TimeEntryEditorSheet";

const LS_OPEN_URI = "bm_last_report_open_uri";
const LS_DISPLAY = "bm_last_report_display";

function buildSummaryPdf(data, start, end, fmtHoursArg, fmtMoneyArg) {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("RootRecord Business Manager — Summary", 14, 18);
  doc.setFontSize(10);
  doc.text(`Period: ${start} — ${end}`, 14, 26);
  doc.setFontSize(12);
  doc.text(`Hours:    ${fmtHoursArg(data.hours)}`, 14, 40);
  doc.text(`Income:   ${fmtMoneyArg(data.income_cents)}`, 14, 48);
  doc.text(`Expenses: ${fmtMoneyArg(data.expense_cents)}`, 14, 56);
  doc.text(`Net:      ${fmtMoneyArg(data.net_cents)}`, 14, 64);
  doc.text("By category:", 14, 78);
  let y = 86;
  const breakdown = Array.isArray(data.breakdown) ? data.breakdown : [];
  breakdown.forEach((b) => {
    doc.text(`  ${b.name.padEnd(20)} ${fmtHoursArg(b.hours)}`, 14, y);
    y += 7;
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
  });
  return doc;
}

export default function Reports() {
  const { guest, user } = useAuth();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [start, setStart] = useState(monthStart.toISOString().slice(0, 10));
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [entries, setEntries] = useState([]);
  const [cats, setCats] = useState({});
  const [loading, setLoading] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const { toast, show, clear } = useToast();

  const lastWebPdfUrlRef = useRef(null);
  const [lastReportDisplay, setLastReportDisplay] = useState(() => {
    if (typeof localStorage === "undefined") return "";
    if (Capacitor.isNativePlatform()) return localStorage.getItem(LS_DISPLAY) || "";
    return "";
  });
  const [hasNativeLast, setHasNativeLast] = useState(() =>
    typeof localStorage !== "undefined" && Capacitor.isNativePlatform() ? Boolean(localStorage.getItem(LS_OPEN_URI)) : false
  );
  const [hasWebLast, setHasWebLast] = useState(false);

  const isPro = user?.plan === "pro";

  useEffect(() => {
    return () => {
      if (lastWebPdfUrlRef.current) {
        URL.revokeObjectURL(lastWebPdfUrlRef.current);
        lastWebPdfUrlRef.current = null;
      }
    };
  }, []);

  async function load() {
    if (guest) return;
    setLoading(true);
    try {
      const sIso = new Date(`${start}T00:00:00`).toISOString();
      const eIso = new Date(`${end}T23:59:59`).toISOString();
      const [{ data: sum }, { data: rows }, { data: catRows }] = await Promise.all([
        api.get("/dashboard/summary", { params: { start: sIso, end: eIso } }),
        api.get("/time/entries", { params: { start: sIso, end: eIso } }),
        api.get("/categories"),
      ]);
      setData(sum);
      setEntries(Array.isArray(rows) ? rows : []);
      const catList = Array.isArray(catRows) ? catRows : [];
      setCats(Object.fromEntries(catList.map((c) => [c.id, c])));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  async function downloadPdf() {
    if (!data) return;
    const filename = `rootrecord-summary-${start}-${end}.pdf`;
    const doc = buildSummaryPdf(data, start, end, fmtHours, fmtMoney);

    try {
      if (Capacitor.isNativePlatform()) {
        const base64 = doc.output("dataurlstring").split(",")[1];
        const path = `Reports/${filename}`;
        const { uri } = await Filesystem.writeFile({
          path,
          data: base64,
          directory: Directory.Data,
          recursive: true,
        });
        const display = `${path} · app storage`;
        localStorage.setItem(LS_OPEN_URI, uri);
        localStorage.setItem(LS_DISPLAY, display);
        setLastReportDisplay(display);
        setHasNativeLast(true);
        show(`PDF saved — ${display}`, "success");
      } else {
        if (lastWebPdfUrlRef.current) {
          URL.revokeObjectURL(lastWebPdfUrlRef.current);
        }
        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);
        lastWebPdfUrlRef.current = url;
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        const webLabel = `${filename} (browser download folder)`;
        setLastReportDisplay(webLabel);
        setHasWebLast(true);
        setHasNativeLast(false);
        show(`PDF saved — ${webLabel}. “Open Last Report” opens a preview in a new tab.`, "success");
      }
    } catch (e) {
      console.error(e);
      show(e?.message || "Could not save PDF", "err");
    }
  }

  async function openLastReport() {
    try {
      if (Capacitor.isNativePlatform()) {
        const uri = localStorage.getItem(LS_OPEN_URI);
        if (!uri) {
          show("No saved report yet. Save a PDF first.", "warn");
          return;
        }
        await FileOpener.open({
          filePath: uri,
          contentType: "application/pdf",
          openWithDefault: true,
        });
      } else {
        const url = lastWebPdfUrlRef.current;
        if (!url) {
          show("No report in this session. Save a PDF again, then open.", "warn");
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      console.error(e);
      show(e?.message || "Could not open PDF", "err");
    }
  }

  const canOpenLast = Capacitor.isNativePlatform() ? hasNativeLast : hasWebLast;

  return (
    <>
      <ScreenHeader title="Reports" subtitle="Date-bound charts and downloadable summary" />
      <PageContainer>
        {guest ? (
          <Empty title="Sign in to view reports" />
        ) : (
          <>
            <div className="card p-3 mb-3 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Start</span>
                <input data-testid="reports-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">End</span>
                <input data-testid="reports-end" type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
              <button data-testid="reports-load-btn" onClick={load} className="btn btn-primary col-span-2">
                Load range
              </button>
              <button
                data-testid="reports-pdf-btn"
                onClick={downloadPdf}
                disabled={!data || (!isPro && entries.length > 100)}
                className="btn btn-secondary col-span-2"
                title={isPro ? "" : "Free plan: PDFs limited to small ranges. Upgrade to Pro for unlimited reports."}
              >
                <Download size={16} /> Save summary PDF{!isPro && " (Free preview)"}
              </button>
              <button
                type="button"
                data-testid="reports-open-last-btn"
                onClick={openLastReport}
                disabled={!canOpenLast}
                className="btn btn-secondary col-span-2"
                title={canOpenLast ? "Open the last saved PDF" : "Save a PDF first"}
              >
                <FileText size={16} /> Open Last Report
              </button>
              {lastReportDisplay ? (
                <p data-testid="reports-last-path" className="col-span-2 text-xs text-ink-tertiary break-all m-0 leading-relaxed">
                  <span className="text-ink-secondary font-medium">Last file: </span>
                  {lastReportDisplay}
                </p>
              ) : (
                <p className="col-span-2 text-xs text-ink-tertiary m-0">After you save, the path appears here.</p>
              )}
            </div>

            {loading ? (
              <Spinner />
            ) : !data ? (
              <Empty title="Pick a range and Load" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Mini label="Hours" value={fmtHours(data.hours)} />
                  <Mini label="Net" value={fmtMoney(data.net_cents)} accent={data.net_cents >= 0 ? "income" : "expense"} />
                  <Mini label="Income" value={fmtMoney(data.income_cents)} accent="income" />
                  <Mini label="Expenses" value={fmtMoney(data.expense_cents)} accent="expense" />
                </div>

                {data.breakdown.length > 0 && (
                  <div className="card p-3 mb-3">
                    <p className="label mb-2">By category</p>
                    <div style={{ width: "100%", height: 200 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={data.breakdown} dataKey="hours" nameKey="name" innerRadius={40} outerRadius={75} stroke="none">
                            {data.breakdown.map((b, i) => (
                              <Cell key={i} fill={b.color} />
                            ))}
                          </Pie>
                          <Tooltip {...rechartsTooltipProps} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ width: "100%", height: 180 }} className="mt-1">
                      <ResponsiveContainer>
                        <BarChart data={data.breakdown} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                          <XAxis dataKey="name" tick={{ fill: "#687777", fontSize: 10 }} angle={-30} textAnchor="end" height={40} interval={0} />
                          <YAxis tick={{ fill: "#687777", fontSize: 10 }} />
                          <Tooltip {...rechartsTooltipProps} />
                          <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                            {data.breakdown.map((b, i) => (
                              <Cell key={i} fill={b.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="card overflow-hidden">
                  <div className="row" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <span className="text-xs text-ink-tertiary uppercase tracking-widest">Entries</span>
                    <span className="text-xs text-ink-tertiary">{entries.length}</span>
                  </div>
                  {entries.length === 0 ? (
                    <p className="p-4 text-sm text-ink-tertiary text-center">No entries in this range.</p>
                  ) : (
                    entries.slice(0, 50).map((e) => {
                      const c = cats[e.category_id];
                      return (
                        <button
                          type="button"
                          key={e.id}
                          data-testid={`reports-entry-${e.id}`}
                          className="row w-full text-left border-0 bg-transparent cursor-pointer hover:bg-[rgba(255,255,255,0.03)]"
                          onClick={() => setEditEntry(e)}
                        >
                          <div className="min-w-0 pr-3 flex-1">
                            <p className="text-sm truncate">
                              {c && <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: c.color }} />}
                              {e.description || c?.name || "Time entry"}
                            </p>
                            <p className="text-xs text-ink-tertiary">
                              {fmtDateShort(e.start_utc)} · {fmtHours(durationHours(e.start_utc, e.end_utc))}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )}
                  {entries.length > 50 && (
                    <p className="p-3 text-xs text-ink-tertiary text-center">+{entries.length - 50} more (download PDF for full list)</p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </PageContainer>
      <Toast message={toast.message} kind={toast.kind} onDone={clear} />
      <TimeEntryEditorSheet
        open={Boolean(editEntry)}
        entry={editEntry}
        categories={Object.values(cats)}
        onClose={() => setEditEntry(null)}
        onSaved={() => load()}
        showToast={show}
        onTaxonomyRefresh={load}
      />
    </>
  );
}

function Mini({ label, value, accent }) {
  const color = accent === "income" ? "text-income" : accent === "expense" ? "text-expense" : "text-ink-primary";
  return (
    <div className="card p-3">
      <p className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</p>
      <p className={`font-heading text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
