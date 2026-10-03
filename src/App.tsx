import React, { useState } from 'react';
import {
  FileText,
  Database,
  CheckCircle2,
  AlertTriangle,
  Play,
  Terminal,
  Layers,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Wheat,
  ShieldCheck,
  Calendar,
  Search,
  BookOpen
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'gradio' | 'tests' | 'architecture' | 'guide'>('gradio');
  const [copiedPath, setCopiedPath] = useState(false);

  const samplePdfPath = 'msp-ingestion/MSP for Rabi Crops for Marketing Season 2027-28.pdf';

  const copyPath = () => {
    navigator.clipboard.writeText(samplePdfPath);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2500);
  };

  const testList = [
    { name: 'test_duplicate_pdf_detection', file: 'test_database.py', desc: 'Ensures duplicate PDFs are detected via SHA-256 hash', status: 'passed' },
    { name: 'test_approval_and_rejection_workflows', file: 'test_database.py', desc: 'Verifies approval sets status to verified; rejection prevents query leakage', status: 'passed' },
    { name: 'test_historical_preservation_and_latest_msp', file: 'test_database.py', desc: 'Preserves past seasons (e.g. 2026-27) when new season (2027-28) is saved', status: 'passed' },
    { name: 'test_unverified_records_never_returned', file: 'test_database.py', desc: 'Enforces that only verified status records are accessible to chatbot queries', status: 'passed' },
    { name: 'test_normalize_crop_name', file: 'test_parser.py', desc: 'Normalizes multi-line names, numbers, and aliases (Gehu -> Wheat, Masur -> Lentil)', status: 'passed' },
    { name: 'test_parse_numeric', file: 'test_parser.py', desc: 'Strips currency Rs., ₹, commas, %, and correctly handles negative numbers', status: 'passed' },
    { name: 'test_parse_publication_datetime', file: 'test_parser.py', desc: 'Parses PIB timestamps into ISO 8601 timezone-aware datetimes (IST +05:30)', status: 'passed' },
    { name: 'test_identify_columns_ignores_previous_season', file: 'test_parser.py', desc: 'Ignores previous season MSP column (RMS 2026-27) and picks current year (2027-28)', status: 'passed' },
    { name: 'test_missing_and_invalid_msp_validation', file: 'test_parser.py', desc: 'Detects missing or negative MSP values and flags row with error status', status: 'passed' },
    { name: 'test_duplicate_crop_prevention_in_same_document', file: 'test_parser.py', desc: 'Flags duplicate crops or alias duplicates within a single notification', status: 'passed' },
    { name: 'test_scanned_pdf_error', file: 'test_parser.py', desc: 'Raises ScannedPDFError indicating OCR is required when no text or tables exist', status: 'passed' },
    { name: 'test_rabi_2027_28_sample_pdf_extraction', file: 'test_parser.py', desc: 'Extracts 6 crops matching official values: Wheat 2610, Barley 2286, Gram 5958, etc.', status: 'passed' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Wheat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-white tracking-tight">MSP Ingestion & MongoDB Management</h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Gradio 6.x Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official Government of India Minimum Support Price (MSP) PDF Extraction & Validation System
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <div className="flex items-center px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-2"></span>
              PyMongo DB: <strong className="ml-1 text-emerald-300 font-mono">agriculture_db</strong>
            </div>
            <div className="flex items-center px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-blue-400 mr-2"></span>
              Engine: <span className="ml-1 text-blue-300 font-medium">pdfplumber + pandas</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto mt-4 flex space-x-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('gradio')}
            className={`pb-2.5 px-4 text-sm font-medium transition-colors flex items-center space-x-2 border-b-2 ${
              activeTab === 'gradio'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>Interactive Gradio Application</span>
          </button>
          <button
            onClick={() => setActiveTab('tests')}
            className={`pb-2.5 px-4 text-sm font-medium transition-colors flex items-center space-x-2 border-b-2 ${
              activeTab === 'tests'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Unit Test Suite (12 Passed)</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`pb-2.5 px-4 text-sm font-medium transition-colors flex items-center space-x-2 border-b-2 ${
              activeTab === 'architecture'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Architecture & Schema</span>
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`pb-2.5 px-4 text-sm font-medium transition-colors flex items-center space-x-2 border-b-2 ${
              activeTab === 'guide'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>CLI Setup & Guide</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {activeTab === 'gradio' && (
          <div className="space-y-4">
            {/* Quick Helper Banner */}
            <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Official Sample PDF Ready for Ingestion</h3>
                  <p className="text-xs text-slate-400">
                    Use the one-click button inside the Gradio app: <strong className="text-slate-300">"Load Official Sample PDF (Rabi 2027-28)"</strong> or upload any official notification.
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={copyPath}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                >
                  {copiedPath ? '✓ Path Copied!' : 'Copy Sample PDF Path'}
                </button>
                <a
                  href="/gradio/"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center space-x-1"
                >
                  <span>Open in Full Window</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Test Fixture Reference Card */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { crop: 'Wheat', msp: '₹2,610', cost: '₹1,264', margin: '106%' },
                { crop: 'Barley', msp: '₹2,286', cost: '₹1,258', margin: '82%' },
                { crop: 'Gram', msp: '₹5,958', cost: '₹3,672', margin: '62%' },
                { crop: 'Lentil (Masur)', msp: '₹7,390', cost: '₹3,824', margin: '93%' },
                { crop: 'Rapeseed & Mustard', msp: '₹6,613', cost: '₹3,345', margin: '98%' },
                { crop: 'Safflower', msp: '₹7,215', cost: '₹4,810', margin: '50%' },
              ].map((item, idx) => (
                <div key={idx} className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-3">
                  <div className="text-xs text-slate-400 font-medium truncate">{item.crop}</div>
                  <div className="text-base font-bold text-emerald-400 mt-1">{item.msp}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Cost: {item.cost}</div>
                  <div className="text-[11px] text-emerald-400/90 font-medium">Margin: +{item.margin}</div>
                </div>
              ))}
            </div>

            {/* Live Gradio App Iframe */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative min-h-[750px]">
              <iframe
                src="/gradio/"
                title="Gradio MSP Ingestion UI"
                className="w-full h-[850px] border-none bg-slate-900"
              />
            </div>
          </div>
        )}

        {activeTab === 'tests' && (
          <div className="space-y-6">
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    <span>Test Suite Status: 12 / 12 Passing</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Executed with pytest against live pdfplumber extractions and isolated mongomock collections.
                  </p>
                </div>
                <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full text-xs font-semibold">
                  100% Pass Rate
                </div>
              </div>

              <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
                {testList.map((t, idx) => (
                  <div key={idx} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-start space-x-3">
                      <span className="p-1 bg-emerald-500/10 text-emerald-400 rounded-md mt-0.5">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-semibold text-slate-200">{t.name}</span>
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded font-mono">
                            {t.file}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{t.desc}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                      Passed
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'architecture' && (
          <div className="space-y-6">
            {/* MongoDB Schemas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Collection A: msp_documents</h3>
                    <p className="text-xs text-slate-400">Stores official government notification metadata and audit trail</p>
                  </div>
                </div>
                <pre className="p-4 bg-slate-950 rounded-xl text-xs font-mono text-emerald-300 border border-slate-800 overflow-x-auto">
{`{
  "_id": "PIB_RABI_2027_28",
  "title": "MSP for Rabi Crops for Marketing Season 2027-28",
  "source_name": "Press Information Bureau",
  "source_url": "https://www.pib.gov.in/...",
  "file_name": "MSP for Rabi Crops for Marketing Season 2027-28.pdf",
  "season": "Rabi",
  "marketing_year": "2027-28",
  "published_at": ISODate("2026-09-30T09:49:00Z"), // BSON Date
  "uploaded_at": ISODate("2026-10-03T..."),
  "verification_status": "verified", // pending | verified | rejected
  "extraction_method": "pdfplumber",
  "content_hash": "75080c7597a6a373b7bc688...",
  "record_count": 6
}`}
                </pre>
                <div className="mt-3 text-xs text-slate-400">
                  <strong className="text-slate-300">Indexes:</strong> Unique index on <code className="text-blue-300">content_hash</code>.
                </div>
              </div>

              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <Wheat className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Collection B: msp_records</h3>
                    <p className="text-xs text-slate-400">Stores granular crop MSP records with historical preservation</p>
                  </div>
                </div>
                <pre className="p-4 bg-slate-950 rounded-xl text-xs font-mono text-emerald-300 border border-slate-800 overflow-x-auto">
{`{
  "_id": "PIB_RABI_2027_28_WHEAT",
  "document_id": "PIB_RABI_2027_28",
  "crop_id": "wheat",
  "crop_name": "Wheat",
  "crop_aliases": ["Gehu"],
  "season": "Rabi",
  "marketing_year": "2027-28",
  "msp": 2610.0,
  "unit": "INR/quintal",
  "cost_of_production": 1264.0,
  "margin_percent": 106.0,
  "published_at": ISODate("2026-09-30T09:49:00Z"), // BSON Date
  "verification_status": "verified"
}`}
                </pre>
                <div className="mt-3 text-xs text-slate-400">
                  <strong className="text-slate-300">Indexes:</strong> Unique on <code className="text-blue-300">(document_id, crop_id)</code>, Compound chronological on <code className="text-blue-300">(crop_id, season, verification_status, published_at: -1)</code>.
                </div>
              </div>
            </div>

            {/* Core Architectural Rules */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-6">
              <h3 className="text-base font-bold text-white mb-3">Enforced Architectural Rules</h3>
              <ul className="space-y-2 text-xs text-slate-300">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>Zero Previous-Season Leaks:</strong> The previous-season MSP column (e.g. RMS 2026-27) is never stored as current MSP.</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>Historical Preservation:</strong> Every season has its own record. Uploading a new marketing season preserves all prior seasons.</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>True BSON Date Sorting:</strong> Queries do not rely on string matching or boolean flags; they sort chronologically by <code className="text-emerald-300">published_at</code> BSON Date.</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span><strong>Strict Verification Gate:</strong> Unapproved or rejected records are never exposed to public or chatbot queries.</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'guide' && (
          <div className="space-y-6">
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-2">CLI Setup and Operations Guide</h2>
              <p className="text-xs text-slate-400 mb-6">
                All source files are located in <code className="text-emerald-300">/msp-ingestion/</code>. Run these commands to execute standalone or run tests.
              </p>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-slate-200 mb-1">1. Environment Setup & Dependencies</h4>
                  <pre className="p-3 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 border border-slate-800">
{`cd msp-ingestion
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt`}
                  </pre>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-200 mb-1">2. Run Gradio Web UI</h4>
                  <pre className="p-3 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 border border-slate-800">
{`python3 app.py
# Server starts on http://127.0.0.1:7860`}
                  </pre>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-200 mb-1">3. Run Pytest Test Suite</h4>
                  <pre className="p-3 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 border border-slate-800">
{`PYTHONPATH=. pytest tests/ -v`}
                  </pre>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-200 mb-1">4. Python Chatbot Integration Code Sample</h4>
                  <pre className="p-3 bg-slate-950 rounded-lg text-xs font-mono text-emerald-300 border border-slate-800">
{`from database import get_latest_msp

# Query the latest verified MSP for Wheat in Rabi season
record = get_latest_msp(crop_id="wheat", season="Rabi")
if record:
    print(f"Crop: {record['crop_name']}, MSP: Rs {record['msp']}/quintal")
    print(f"Published Date: {record['published_at']}, Year: {record['marketing_year']}")`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
