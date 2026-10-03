import React, { useState, useEffect } from 'react';
import {
  Wheat,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  MessageSquare,
  History,
  Download,
  RotateCcw,
  Search,
  ExternalLink,
  Shield,
  Layers,
  Sparkles,
  Info,
  Check,
  ArrowRight,
  Save,
  Server,
  KeyRound,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import {
  extractPdfClient,
  DocumentMetadata,
  ExtractedCropRecord,
  ExtractionResult
} from './services/pdfExtractorClient';
import { StorageService } from './services/storageService';
import { normalizeCropName } from './services/cropDictionary';
import { MongoApiClient, MongoStatusResponse } from './services/mongoApiClient';

export default function App() {
  const [activeTab, setActiveTab] = useState<'ingestion' | 'database' | 'chatbot' | 'history' | 'mongodb' | 'export'>('ingestion');

  // MongoDB Atlas Live Status
  const [mongoStatus, setMongoStatus] = useState<MongoStatusResponse>({
    configured: false,
    connected: false,
    maskedUri: null,
    database: 'agriculture_db'
  });
  const [isCheckingMongo, setIsCheckingMongo] = useState(false);

  // MongoDB Settings inputs
  const [inputMongoUri, setInputMongoUri] = useState('');
  const [inputMongoDb, setInputMongoDb] = useState('agriculture_db');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; hint?: string } | null>(null);
  const [isTestingMongo, setIsTestingMongo] = useState(false);

  // Ingestion State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState('https://www.pib.gov.in/PressReleaseDetail.aspx?PRID=2316956&reg=48&lang=1');
  const [isExtracting, setIsExtracting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    text: string;
    details?: string;
    hint?: string;
  } | null>({
    type: 'info',
    text: 'Ready for PDF upload. Select an official notification PDF or click "Load Official Sample PDF (Rabi 2027-28)".'
  });

  // Metadata State
  const [metadata, setMetadata] = useState<DocumentMetadata>({
    _id: '',
    title: '',
    source_name: 'Press Information Bureau',
    source_url: '',
    file_name: '',
    season: 'Rabi',
    marketing_year: '2027-28',
    published_at: '',
    content_hash: '',
    verification_status: 'pending'
  });

  // Table State
  const [candidateRecords, setCandidateRecords] = useState<ExtractedCropRecord[]>([]);
  const [rejectionReason, setRejectionReason] = useState('');
  const [validationLogs, setValidationLogs] = useState<{ status: string; crop_name: string; errors: string[] }[]>([]);

  // Modal State for Save Confirmation
  const [saveSuccessModal, setSaveSuccessModal] = useState<{
    isOpen: boolean;
    docId: string;
    count: number;
    atlasStatus: 'saved' | 'failed' | 'not_configured';
    atlasMessage: string;
    atlasHint?: string;
  }>({
    isOpen: false,
    docId: '',
    count: 0,
    atlasStatus: 'not_configured',
    atlasMessage: ''
  });

  // Database Tab State
  const [documentsList, setDocumentsList] = useState<DocumentMetadata[]>([]);
  const [recordsList, setRecordsList] = useState<any[]>([]);
  const [filterCrop, setFilterCrop] = useState('All');
  const [filterSeason, setFilterSeason] = useState('All');
  const [filterYear, setFilterYear] = useState('All');

  // Chatbot Simulation State
  const [chatCrop, setChatCrop] = useState('Wheat');
  const [chatSeason, setChatSeason] = useState('Rabi');
  const [chatResponse, setChatResponse] = useState<string | null>(null);

  // History Tab State
  const [historyCrop, setHistoryCrop] = useState('wheat');
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);

  // Refresh DB lists
  const refreshDb = () => {
    setDocumentsList(StorageService.listDocuments());
    setRecordsList(StorageService.listRecords(filterCrop, filterSeason, filterYear));
    setHistoryRecords(StorageService.getHistoricalRecords(historyCrop));
  };

  // Check MongoDB Atlas status from backend
  const checkMongoStatus = async () => {
    setIsCheckingMongo(true);
    const status = await MongoApiClient.checkStatus();
    setMongoStatus(status);
    setIsCheckingMongo(false);
  };

  useEffect(() => {
    refreshDb();
    checkMongoStatus();
    const saved = MongoApiClient.getSavedCustomConfig();
    if (saved.uri) setInputMongoUri(saved.uri);
    if (saved.database) setInputMongoDb(saved.database);
  }, []);

  useEffect(() => {
    refreshDb();
  }, [filterCrop, filterSeason, filterYear, historyCrop]);

  // Handle Testing Custom MongoDB Atlas Connection
  const handleTestMongo = async () => {
    setIsTestingMongo(true);
    setTestResult(null);
    MongoApiClient.setCustomConfig(inputMongoUri, inputMongoDb);
    const res = await MongoApiClient.testConnection(inputMongoUri, inputMongoDb);
    setTestResult(res);
    setIsTestingMongo(false);
    checkMongoStatus();
  };

  // Load Official Sample PDF
  const handleLoadSamplePdf = async (autoSave: boolean = false) => {
    try {
      setIsExtracting(true);
      setStatusMessage({ type: 'info', text: 'Fetching and scraping official Rabi 2027-28 PDF fixture...' });

      const response = await fetch('/sample_rabi_2027_28.pdf');
      if (!response.ok) {
        throw new Error('Sample PDF file not found at /sample_rabi_2027_28.pdf');
      }
      const buffer = await response.arrayBuffer();

      const result: ExtractionResult = await extractPdfClient(
        buffer,
        'MSP for Rabi Crops for Marketing Season 2027-28.pdf',
        sourceUrl
      );

      setMetadata(result.metadata);
      setCandidateRecords(result.records);
      setValidationLogs(result.logs);

      if (autoSave) {
        await executeSave(result.metadata, result.records);
      } else {
        const dup = StorageService.checkDuplicate(result.metadata.content_hash);
        if (dup) {
          setStatusMessage({
            type: 'warning',
            text: `⚠️ Duplicate PDF Detected! Previously saved as '${dup._id}'. Click 'Approve & Save to Database' below to update records.`
          });
        } else {
          setStatusMessage({
            type: 'success',
            text: `✅ Extracted ${result.records.length} crop records from PDF! Click 'Approve & Save to Database' below to persist in MongoDB.`
          });
        }
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Extraction failed: ${err.message}` });
    } finally {
      setIsExtracting(false);
    }
  };

  // Handle User File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    try {
      setIsExtracting(true);
      setStatusMessage({ type: 'info', text: `Extracting text and tables from ${file.name}...` });

      const buffer = await file.arrayBuffer();
      const result = await extractPdfClient(buffer, file.name, sourceUrl);

      setMetadata(result.metadata);
      setCandidateRecords(result.records);
      setValidationLogs(result.logs);

      const dup = StorageService.checkDuplicate(result.metadata.content_hash);
      if (dup) {
        setStatusMessage({
          type: 'warning',
          text: `⚠️ Duplicate PDF Detected! Previously ingested as '${dup._id}'. Click 'Approve & Save' to update.`
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `✅ Scraped ${result.records.length} candidate crops. Click 'Approve & Save to Database' to persist.`
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Extraction error: ${err.message}` });
    } finally {
      setIsExtracting(false);
    }
  };

  // Validate Table Data
  const handleValidateData = () => {
    if (candidateRecords.length === 0) {
      setStatusMessage({ type: 'error', text: 'No crop records to validate. Please upload or load a PDF first.' });
      return;
    }

    const seenCrops = new Set<string>();
    const updated = candidateRecords.map(rec => {
      const errs: string[] = [];
      const cropId = rec.crop_id || normalizeCropName(rec.crop_name).cropId;

      if (seenCrops.has(cropId)) {
        errs.push(`Duplicate crop detected: ${rec.crop_name}`);
      } else {
        seenCrops.add(cropId);
      }

      if (!rec.msp || rec.msp <= 0) {
        errs.push('MSP must be a positive number');
      }

      return {
        ...rec,
        crop_id: cropId,
        validation_status: errs.length > 0 ? ('error' as const) : ('valid' as const),
        validation_errors: errs
      };
    });

    setCandidateRecords(updated);
    const hasErrors = updated.some(r => r.validation_status === 'error');
    if (hasErrors) {
      setStatusMessage({ type: 'error', text: 'Validation identified issues: Please review row errors marked in red.' });
    } else {
      setStatusMessage({ type: 'success', text: `✅ All ${updated.length} crop records passed validation! Click 'Approve & Save to Database'.` });
    }
  };

  // Common Save Execution Function: Persists locally AND calls MongoDB Atlas
  const executeSave = async (doc: DocumentMetadata, records: ExtractedCropRecord[]) => {
    // 1. Sanitize records
    const invalid = records.filter(r => typeof r.msp !== 'number' || isNaN(r.msp) || r.msp <= 0);
    if (invalid.length > 0) {
      setStatusMessage({
        type: 'error',
        text: `Cannot save: invalid MSP for ${invalid.map(r => r.crop_name).join(', ')}. Fix these rows first.`
      });
      return;
    }
    const sanitizedRecords = records.map(r => ({
      ...r,
      validation_status: 'valid' as const,
      validation_errors: []
    }));

    const season = doc.season || 'Rabi';
    const year = doc.marketing_year || '2027-28';
    const docId = doc._id && doc._id.trim()
      ? doc._id.trim()
      : `PIB_${season.toUpperCase()}_${year.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const docToSave: DocumentMetadata = {
      ...doc,
      _id: docId,
      season,
      marketing_year: year,
      published_at: doc.published_at || new Date().toISOString(),
      title: doc.title || `Cabinet approves MSP for ${season} Crops for Marketing Season ${year}`,
      verification_status: 'verified'
    };

    // 2. Persist locally first
    const localRes = StorageService.saveApprovedDocument(docToSave, sanitizedRecords);
    setMetadata(docToSave);
    setCandidateRecords(sanitizedRecords);
    refreshDb();

    // 3. Persist to MongoDB Atlas via backend API
    const atlasRes = await MongoApiClient.saveToAtlas(docToSave, sanitizedRecords);

    if (atlasRes.success) {
      setSaveSuccessModal({
        isOpen: true,
        docId: docToSave._id,
        count: sanitizedRecords.length,
        atlasStatus: 'saved',
        atlasMessage: atlasRes.message
      });

      setStatusMessage({
        type: 'success',
        text: `🎉 Approved & Saved! Document '${docToSave._id}' (${sanitizedRecords.length} crops) successfully written to MongoDB Atlas!`,
        details: `Database: ${atlasRes.database || 'agriculture_db'} | Collections: msp_documents, msp_records`
      });
      checkMongoStatus();
    } else {
      // Atlas failed or not configured
      const isNotConfigured = atlasRes.message.includes('not configured');
      setSaveSuccessModal({
        isOpen: true,
        docId: docToSave._id,
        count: sanitizedRecords.length,
        atlasStatus: isNotConfigured ? 'not_configured' : 'failed',
        atlasMessage: atlasRes.message,
        atlasHint: atlasRes.hint
      });

      setStatusMessage({
        type: isNotConfigured ? 'warning' : 'error',
        text: isNotConfigured
          ? `⚠️ Saved locally, but MongoDB Atlas is NOT configured! No live cluster received this data.`
          : `⚠️ Saved locally, but FAILED to upload to MongoDB Atlas!`,
        details: atlasRes.message,
        hint: atlasRes.hint || 'Check MONGODB_URI in your .env or configure in "MongoDB Atlas Settings" tab.'
      });
    }
  };

  // Approve and Save Handler
  const handleApproveAndSave = async () => {
    if (candidateRecords.length === 0) {
      setStatusMessage({
        type: 'info',
        text: 'No PDF extracted yet. Automatically loading and saving the official Rabi 2027-28 notification PDF...'
      });
      await handleLoadSamplePdf(true);
      return;
    }

    await executeSave(metadata, candidateRecords);
  };

  // Reject Document
  const handleReject = () => {
    if (!metadata._id) {
      setStatusMessage({ type: 'error', text: 'No document loaded to reject.' });
      return;
    }

    const reason = rejectionReason || 'Administrator rejected document.';
    const res = StorageService.saveRejectedDocument(metadata, reason);
    if (res.success) {
      setStatusMessage({
        type: 'warning',
        text: `⚠️ Document '${metadata._id}' marked as Rejected. Audit trail preserved in msp_documents; records will NOT appear in queries.`
      });
      refreshDb();
    }
  };

  // Reset
  const handleReset = () => {
    setSelectedFile(null);
    setMetadata({
      _id: '',
      title: '',
      source_name: 'Press Information Bureau',
      source_url: '',
      file_name: '',
      season: 'Rabi',
      marketing_year: '2027-28',
      published_at: '',
      content_hash: '',
      verification_status: 'pending'
    });
    setCandidateRecords([]);
    setValidationLogs([]);
    setRejectionReason('');
    setStatusMessage({ type: 'info', text: 'Form reset. Upload a new PDF to begin.' });
  };

  // Chatbot Query Simulator
  const handleRunChatQuery = () => {
    const rec = StorageService.getLatestMsp(chatCrop, chatSeason);
    if (!rec) {
      setChatResponse(`❌ No verified MSP record found for "${chatCrop}" in "${chatSeason}" season.\n\nEnsure notification has been approved by administrator in Section D.`);
      return;
    }

    const costStr = rec.cost_of_production ? `₹${rec.cost_of_production}/quintal` : 'N/A';
    const marginStr = rec.margin_percent ? `${rec.margin_percent}%` : 'N/A';

    setChatResponse(
`🌾 Official Minimum Support Price (MSP) Retrieval
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Crop: ${rec.crop_name} (${rec.crop_id})
• Season: ${rec.season} (Marketing Year: ${rec.marketing_year})
• Verified MSP: ₹${rec.msp?.toLocaleString('en-IN')} per quintal
• Cost of Production (A2+FL): ${costStr}
• Margin over Cost: ${marginStr}
• Publication Timestamp: ${rec.published_at}
• Verification Status: VERIFIED ✅
• Source Document ID: ${rec.document_id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(Retrieved via chronological descending sort by published_at timestamp)`
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/90 backdrop-blur sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Wheat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-white">MSP PDF Ingestion & MongoDB Management</h1>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  100% Vercel Ready
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official Government of India Minimum Support Price PDF Scraper & Verification System
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Live MongoDB Atlas Status Indicator */}
            <button
              onClick={() => setActiveTab('mongodb')}
              className={`flex items-center px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                mongoStatus.connected
                  ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900'
                  : mongoStatus.configured
                  ? 'bg-rose-950/80 border-rose-500/40 text-rose-300 hover:bg-rose-900'
                  : 'bg-amber-950/80 border-amber-500/40 text-amber-300 hover:bg-amber-900'
              }`}
              title="Click to manage MongoDB Atlas settings and connection"
            >
              <Database className="w-3.5 h-3.5 mr-1.5" />
              <span>
                Atlas:{' '}
                {isCheckingMongo ? (
                  <span className="text-slate-400">Checking...</span>
                ) : mongoStatus.connected ? (
                  <strong className="text-emerald-400">Connected ({mongoStatus.database})</strong>
                ) : mongoStatus.configured ? (
                  <strong className="text-rose-400">Connection Failed ⚠️</strong>
                ) : (
                  <strong className="text-amber-400">Not Configured (Click to set)</strong>
                )}
              </span>
            </button>

            <div className="flex items-center px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
              <Shield className="w-3.5 h-3.5 text-emerald-400 mr-1.5" />
              <span>Scraper: <strong className="text-emerald-300">pdfjs-dist (Vercel Native)</strong></span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto mt-4 flex overflow-x-auto space-x-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('ingestion')}
            className={`pb-2.5 px-4 text-sm font-medium transition-colors flex items-center space-x-2 border-b-2 whitespace-nowrap ${
              activeTab === 'ingestion'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>1. Ingest & Verify Notification</span>
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`pb-2.5 px-4 text-sm font-medium transition-colors flex items-center space-x-2 border-b-2 whitespace-nowrap ${
              activeTab === 'database'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>2. Database Explorer ({documentsList.length} Docs / {recordsList.length} Crops)</span>
          </button>
          <button
            onClick={() => setActiveTab('chatbot')}
            className={`pb-2.5 px-4 text-sm font-medium transition-colors flex items-center space-x-2 border-b-2 whitespace-nowrap ${
              activeTab === 'chatbot'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>3. Chatbot MSP Query Simulator</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-4 text-sm font-medium transition-colors flex items-center space-x-2 border-b-2 whitespace-nowrap ${
              activeTab === 'history'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>4. Historical Seasons</span>
          </button>
          <button
            onClick={() => setActiveTab('mongodb')}
            className={`pb-2.5 px-4 text-sm font-medium transition-colors flex items-center space-x-2 border-b-2 whitespace-nowrap ${
              activeTab === 'mongodb'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>5. MongoDB Atlas Settings & Sync</span>
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`pb-2.5 px-4 text-sm font-medium transition-colors flex items-center space-x-2 border-b-2 whitespace-nowrap ${
              activeTab === 'export'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>6. JSON Exporter</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Status Notification Banner with Detailed Error Guidance */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl border flex flex-col gap-2 transition-all ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                : statusMessage.type === 'warning'
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start space-x-3">
                {statusMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
                {statusMessage.type === 'error' && <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
                {statusMessage.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
                {statusMessage.type === 'info' && <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />}
                <div>
                  <div className="text-sm font-semibold leading-relaxed">{statusMessage.text}</div>
                  {statusMessage.details && (
                    <div className="text-xs font-mono opacity-80 mt-0.5">{statusMessage.details}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={handleApproveAndSave}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md flex items-center space-x-1.5 cursor-pointer hover:scale-105 active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>Approve & Save to Database</span>
                </button>
              </div>
            </div>

            {statusMessage.hint && (
              <div className="mt-1 pt-2 border-t border-slate-700/50 text-xs flex items-center justify-between text-amber-300/90">
                <div className="flex items-center space-x-1.5">
                  <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span><strong>Troubleshooting Hint:</strong> {statusMessage.hint}</span>
                </div>
                <button
                  onClick={() => setActiveTab('mongodb')}
                  className="underline hover:text-white ml-2 shrink-0 cursor-pointer font-semibold"
                >
                  Open MongoDB Settings &rarr;
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 1: Ingestion & Verification */}
        {activeTab === 'ingestion' && (
          <div className="space-y-6">
            {/* Top Row: Upload & Metadata */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Section A: Upload */}
              <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <span>Section A: Upload Government PDF</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">PDF text & table scraper</span>
                </div>

                <div className="border-2 border-dashed border-slate-700/80 hover:border-emerald-500/60 transition-colors rounded-xl p-6 text-center bg-slate-950/40">
                  <FileText className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                  <p className="text-xs text-slate-300 mb-1 font-medium">
                    {selectedFile ? selectedFile.name : 'Select or drop official MSP notification PDF'}
                  </p>
                  <p className="text-[11px] text-slate-500 mb-4">Supported: Official PIB/MoA PDF notifications</p>
                  <label className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors shadow">
                    <span>Browse PDF File</span>
                    <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Official Press Release URL (Optional)</label>
                  <input
                    type="text"
                    value={sourceUrl}
                    onChange={e => setSourceUrl(e.target.value)}
                    placeholder="https://www.pib.gov.in/..."
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      onClick={() => handleLoadSamplePdf(false)}
                      disabled={isExtracting}
                      className="py-2.5 px-3 text-xs font-semibold rounded-lg bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-500/40 transition-colors flex items-center justify-center space-x-1.5 shadow cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Load Sample PDF</span>
                    </button>
                    <button
                      onClick={() => handleLoadSamplePdf(true)}
                      disabled={isExtracting}
                      className="py-2.5 px-3 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center justify-center space-x-1.5 shadow cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>1-Click Load & Save</span>
                    </button>
                  </div>
                  <button
                    onClick={handleReset}
                    className="py-2 px-3 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Form</span>
                  </button>
                </div>
              </div>

              {/* Section B: Metadata */}
              <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>Section B: Document Metadata</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {metadata.content_hash ? `Hash: ${metadata.content_hash.substring(0, 10)}...` : 'Awaiting extraction'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Document ID (_id)</label>
                    <input
                      type="text"
                      value={metadata._id}
                      onChange={e => setMetadata({ ...metadata, _id: e.target.value })}
                      placeholder="e.g. PIB_RABI_2027_28"
                      className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Source Name</label>
                    <input
                      type="text"
                      value={metadata.source_name}
                      onChange={e => setMetadata({ ...metadata, source_name: e.target.value })}
                      className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Document Title</label>
                  <input
                    type="text"
                    value={metadata.title}
                    onChange={e => setMetadata({ ...metadata, title: e.target.value })}
                    placeholder="Cabinet approves MSP for Rabi Crops..."
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Season</label>
                    <select
                      value={metadata.season}
                      onChange={e => setMetadata({ ...metadata, season: e.target.value })}
                      className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="Rabi">Rabi</option>
                      <option value="Kharif">Kharif</option>
                      <option value="Zaid">Zaid</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Marketing Year</label>
                    <input
                      type="text"
                      value={metadata.marketing_year}
                      onChange={e => setMetadata({ ...metadata, marketing_year: e.target.value })}
                      placeholder="2027-28"
                      className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Publication Timestamp (ISO 8601)</label>
                    <input
                      type="text"
                      value={metadata.published_at}
                      onChange={e => setMetadata({ ...metadata, published_at: e.target.value })}
                      placeholder="2026-09-30T15:19:00+05:30"
                      className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section C: Extracted Table Preview */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <Wheat className="w-4 h-4 text-emerald-400" />
                    <span>Section C: Extracted MSP Table Preview & Inline Correction</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Previous-season MSP columns (RMS 2026-27) are automatically discarded. Edit any cell below before approving.
                  </p>
                </div>
                <button
                  onClick={handleValidateData}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center space-x-1.5 self-start cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Validate Data</span>
                </button>
              </div>

              {candidateRecords.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-400 text-xs space-y-2 bg-slate-950/20">
                  <p className="font-medium text-slate-300">No candidate records loaded yet.</p>
                  <p className="text-slate-500">Upload a PDF notification, or click the button below to test with the official Rabi 2027-28 fixture:</p>
                  <button
                    onClick={() => handleLoadSamplePdf(false)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-500/40 text-xs font-semibold hover:bg-emerald-900 transition-colors cursor-pointer mt-2"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Load Official Sample PDF Now</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Crop Name</th>
                        <th className="py-2.5 px-3">Canonical ID</th>
                        <th className="py-2.5 px-3">Season</th>
                        <th className="py-2.5 px-3">Year</th>
                        <th className="py-2.5 px-3">MSP (₹/Qtl)</th>
                        <th className="py-2.5 px-3">Cost (₹)</th>
                        <th className="py-2.5 px-3">Margin (%)</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                      {candidateRecords.map((row, idx) => (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-800/30 transition-colors ${
                            row.validation_status === 'error' ? 'bg-rose-950/20' : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-slate-500 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={row.crop_name}
                              onChange={e => {
                                const next = [...candidateRecords];
                                next[idx].crop_name = e.target.value;
                                const { cropId, aliases } = normalizeCropName(e.target.value);
                                next[idx].crop_id = cropId;
                                next[idx].crop_aliases = aliases;
                                setCandidateRecords(next);
                              }}
                              className="bg-transparent border-b border-slate-700/60 focus:border-emerald-500 px-1 py-0.5 text-white font-medium focus:outline-none w-36"
                            />
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-400">{row.crop_id}</td>
                          <td className="py-2 px-3 text-slate-300">{row.season}</td>
                          <td className="py-2 px-3 text-slate-300 font-mono">{row.marketing_year}</td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              value={row.msp || ''}
                              onChange={e => {
                                const next = [...candidateRecords];
                                next[idx].msp = parseFloat(e.target.value) || null;
                                setCandidateRecords(next);
                              }}
                              className="bg-transparent border-b border-slate-700/60 focus:border-emerald-500 px-1 py-0.5 text-emerald-400 font-bold focus:outline-none w-24"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              value={row.cost_of_production || ''}
                              onChange={e => {
                                const next = [...candidateRecords];
                                next[idx].cost_of_production = parseFloat(e.target.value) || null;
                                setCandidateRecords(next);
                              }}
                              className="bg-transparent border-b border-slate-700/60 focus:border-emerald-500 px-1 py-0.5 text-slate-300 focus:outline-none w-20"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              value={row.margin_percent || ''}
                              onChange={e => {
                                const next = [...candidateRecords];
                                next[idx].margin_percent = parseFloat(e.target.value) || null;
                                setCandidateRecords(next);
                              }}
                              className="bg-transparent border-b border-slate-700/60 focus:border-emerald-500 px-1 py-0.5 text-blue-400 focus:outline-none w-16"
                            />
                          </td>
                          <td className="py-2 px-3">
                            {row.validation_status === 'valid' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Valid
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                Error
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section D: Review & Approval Decision */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Section D: Review & Approval Decision</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Clicking <strong className="text-emerald-300">Approve & Save to Database</strong> will write the document to <code className="text-blue-300">msp_documents</code> and persists all crop records into <code className="text-emerald-300">msp_records</code> with verified status.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {mongoStatus.connected ? (
                    <span className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Atlas Sync: Active</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      <span>Local Storage (Atlas Not Connected)</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <button
                  onClick={handleApproveAndSave}
                  className="px-6 py-3 text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer hover:scale-102 active:scale-98"
                >
                  <Check className="w-5 h-5 text-white" />
                  <span>Approve & Save to Database</span>
                </button>

                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder="Optional rejection reason if document is invalid..."
                    className="flex-1 text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 focus:outline-none focus:border-rose-500"
                  />
                  <button
                    onClick={handleReject}
                    className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 transition-colors flex items-center space-x-1.5 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Database Explorer */}
        {activeTab === 'database' && (
          <div className="space-y-6">
            {/* Stored Documents */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>Collection: msp_documents ({documentsList.length})</span>
                </h3>
                <span className="text-xs text-slate-400">Audit logs & verification status</span>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Document ID</th>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-3">Season</th>
                      <th className="py-2.5 px-3">Year</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Published At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                    {documentsList.map((doc, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-mono text-emerald-400 font-semibold">{doc._id}</td>
                        <td className="py-2 px-3 text-slate-200 max-w-xs truncate">{doc.title}</td>
                        <td className="py-2 px-3 text-slate-300">{doc.season}</td>
                        <td className="py-2 px-3 font-mono text-slate-300">{doc.marketing_year}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              doc.verification_status === 'verified'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : doc.verification_status === 'rejected'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            {doc.verification_status}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">{doc.published_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stored Records */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>Collection: msp_records ({recordsList.length})</span>
                  </h3>
                  <p className="text-xs text-slate-400">Granular crop records preserved across historical marketing seasons</p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={filterCrop}
                    onChange={e => setFilterCrop(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="All">All Crops</option>
                    <option value="wheat">Wheat</option>
                    <option value="barley">Barley</option>
                    <option value="gram">Gram</option>
                    <option value="lentil_masur">Lentil (Masur)</option>
                    <option value="rapeseed_mustard">Rapeseed & Mustard</option>
                    <option value="safflower">Safflower</option>
                  </select>

                  <select
                    value={filterSeason}
                    onChange={e => setFilterSeason(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="All">All Seasons</option>
                    <option value="Rabi">Rabi</option>
                    <option value="Kharif">Kharif</option>
                  </select>

                  <select
                    value={filterYear}
                    onChange={e => setFilterYear(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="All">All Years</option>
                    <option value="2027-28">2027-28</option>
                    <option value="2026-27">2026-27</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Record ID</th>
                      <th className="py-2.5 px-3">Crop Name</th>
                      <th className="py-2.5 px-3">Season</th>
                      <th className="py-2.5 px-3">Year</th>
                      <th className="py-2.5 px-3">MSP (₹/Qtl)</th>
                      <th className="py-2.5 px-3">Cost (₹)</th>
                      <th className="py-2.5 px-3">Margin</th>
                      <th className="py-2.5 px-3">Published Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
                    {recordsList.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">{r._id}</td>
                        <td className="py-2 px-3 text-white font-medium">{r.crop_name}</td>
                        <td className="py-2 px-3 text-slate-300">{r.season}</td>
                        <td className="py-2 px-3 font-mono text-slate-300">{r.marketing_year}</td>
                        <td className="py-2 px-3 font-bold text-emerald-400">₹{r.msp?.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-slate-300">₹{r.cost_of_production}</td>
                        <td className="py-2 px-3 text-blue-400">+{r.margin_percent}%</td>
                        <td className="py-2 px-3 font-mono text-slate-500 text-[11px]">{r.published_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Chatbot MSP Query Simulator */}
        {activeTab === 'chatbot' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Chatbot Latest Verified MSP Query</h3>
                  <p className="text-xs text-slate-400">
                    Tests <code className="text-emerald-300 font-mono">getLatestMsp(crop_id, season)</code> with chronological sorting by published timestamp descending.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Crop Name or Vernacular Alias</label>
                  <select
                    value={chatCrop}
                    onChange={e => setChatCrop(e.target.value)}
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                  >
                    <option value="Wheat">Wheat</option>
                    <option value="Gehu">Gehu (Alias for Wheat)</option>
                    <option value="Barley">Barley</option>
                    <option value="Jau">Jau (Alias for Barley)</option>
                    <option value="Gram">Gram</option>
                    <option value="Chana">Chana (Alias for Gram)</option>
                    <option value="Lentil (Masur)">Lentil (Masur)</option>
                    <option value="Masur">Masur (Alias for Lentil)</option>
                    <option value="Rapeseed & Mustard">Rapeseed & Mustard</option>
                    <option value="Sarson">Sarson (Alias for Mustard)</option>
                    <option value="Safflower">Safflower</option>
                    <option value="Kusum">Kusum (Alias for Safflower)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Season</label>
                  <select
                    value={chatSeason}
                    onChange={e => setChatSeason(e.target.value)}
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200"
                  >
                    <option value="Rabi">Rabi</option>
                    <option value="Kharif">Kharif</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleRunChatQuery}
                className="w-full py-2.5 px-4 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow transition-colors flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Search className="w-4 h-4" />
                <span>Execute Chatbot Query</span>
              </button>

              {chatResponse && (
                <div className="pt-4">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Chatbot Response Output:</label>
                  <pre className="p-4 bg-slate-950 rounded-xl text-xs font-mono text-emerald-300 border border-slate-800 whitespace-pre-wrap leading-relaxed shadow-inner">
                    {chatResponse}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Historical Seasons */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                    <History className="w-4 h-4 text-blue-400" />
                    <span>Historical Season Progression & Preservation</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Demonstrates that saving Marketing Year 2027-28 preserves 2026-27 and older seasons in the database.
                  </p>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400">Select Crop:</span>
                  <select
                    value={historyCrop}
                    onChange={e => setHistoryCrop(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200"
                  >
                    <option value="wheat">Wheat</option>
                    <option value="barley">Barley</option>
                    <option value="gram">Gram</option>
                    <option value="lentil_masur">Lentil (Masur)</option>
                    <option value="rapeseed_mustard">Rapeseed & Mustard</option>
                    <option value="safflower">Safflower</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {historyRecords.map((rec, idx) => (
                  <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">{rec.season} {rec.marketing_year}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        {rec.validation_status}
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-emerald-400">
                      ₹{rec.msp?.toLocaleString('en-IN')}
                      <span className="text-xs text-slate-400 font-normal ml-1">/quintal</span>
                    </div>
                    <div className="text-xs text-slate-400 flex justify-between pt-1 border-t border-slate-800">
                      <span>Cost: ₹{rec.cost_of_production}</span>
                      <span className="text-blue-400">Margin: +{rec.margin_percent}%</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">
                      Pub: {rec.published_at}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: MongoDB Atlas Settings & Sync */}
        {activeTab === 'mongodb' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <Database className="w-5 h-5 text-emerald-400" />
                    <span>MongoDB Atlas Live Cluster Configuration</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Connect your MongoDB Atlas cluster so approved PDF notifications are written directly to your cloud collections.
                  </p>
                </div>
                <button
                  onClick={checkMongoStatus}
                  disabled={isCheckingMongo}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center space-x-1.5 self-start cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCheckingMongo ? 'animate-spin' : ''}`} />
                  <span>Refresh Status</span>
                </button>
              </div>

              {/* Status Card */}
              <div
                className={`p-4 rounded-xl border flex items-start space-x-3 ${
                  mongoStatus.connected
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : mongoStatus.configured
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                }`}
              >
                {mongoStatus.connected ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                ) : mongoStatus.configured ? (
                  <XCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 text-xs">
                  <div className="text-sm font-bold">
                    {mongoStatus.connected
                      ? 'Connected to MongoDB Atlas Cluster!'
                      : mongoStatus.configured
                      ? 'Connection to MongoDB Atlas Failed'
                      : 'MongoDB Atlas URI Not Configured'}
                  </div>
                  {mongoStatus.maskedUri && (
                    <div className="font-mono text-[11px] text-slate-300">
                      URI: {mongoStatus.maskedUri} | Database: {mongoStatus.database}
                    </div>
                  )}
                  {mongoStatus.error && (
                    <div className="font-mono text-rose-300 mt-1 bg-rose-950/60 p-2 rounded border border-rose-500/30">
                      Error: {mongoStatus.error}
                    </div>
                  )}
                  {mongoStatus.hint && (
                    <div className="text-slate-200 mt-1 font-sans">
                      <strong>Guidance:</strong> {mongoStatus.hint}
                    </div>
                  )}
                  {mongoStatus.stats && (
                    <div className="text-emerald-300 pt-1 flex items-center space-x-3">
                      <span>Documents in Atlas: <strong>{mongoStatus.stats.documents}</strong></span>
                      <span>Crop Records in Atlas: <strong>{mongoStatus.stats.records}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Configure Connection Form */}
              <div className="space-y-4 bg-slate-950/60 p-5 rounded-xl border border-slate-800">
                <h4 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <KeyRound className="w-4 h-4 text-blue-400" />
                  <span>Enter or Override MongoDB Atlas Connection String</span>
                </h4>
                <p className="text-xs text-slate-400">
                  You can set <code className="text-emerald-300">MONGODB_URI</code> in your <code className="text-blue-300">.env</code> file (or Vercel Environment Variables), or paste it here:
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      MongoDB Connection URI (SRV format)
                    </label>
                    <input
                      type="password"
                      value={inputMongoUri}
                      onChange={e => setInputMongoUri(e.target.value)}
                      placeholder="mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority"
                      className="w-full text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Database Name
                    </label>
                    <input
                      type="text"
                      value={inputMongoDb}
                      onChange={e => setInputMongoDb(e.target.value)}
                      placeholder="agriculture_db"
                      className="w-full sm:w-64 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      onClick={handleTestMongo}
                      disabled={isTestingMongo || !inputMongoUri}
                      className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingMongo ? 'animate-spin' : ''}`} />
                      <span>Test & Save Connection</span>
                    </button>
                  </div>
                </div>

                {testResult && (
                  <div
                    className={`mt-4 p-3 rounded-lg border text-xs ${
                      testResult.success
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    <div className="font-semibold">{testResult.message}</div>
                    {testResult.hint && (
                      <div className="mt-1 text-slate-300 font-sans">
                        💡 <strong>Hint:</strong> {testResult.hint}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Troubleshooting Guide Box */}
              <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 space-y-2 text-xs text-slate-400">
                <h5 className="font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span>Important MongoDB Atlas Setup Checklist:</span>
                </h5>
                <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] leading-relaxed">
                  <li>
                    <strong>Network Access (IP Whitelist):</strong> On your MongoDB Atlas dashboard, navigate to <em>Network Access</em> &rarr; <em>IP Access List</em> &rarr; Add <code>0.0.0.0/0</code> (Allow Access from Anywhere) so Vercel and your web browser can connect.
                  </li>
                  <li>
                    <strong>Database User:</strong> Ensure the database user has <em>Read and write to any database</em> role.
                  </li>
                  <li>
                    <strong>Password Encoding:</strong> If your MongoDB password has special characters like <code>@</code>, <code>#</code>, <code>:</code>, or <code>%</code>, URL-encode them (e.g. <code>@</code> becomes <code>%40</code>).
                  </li>
                  <li>
                    <strong>Vercel Deployment:</strong> Add <code>MONGODB_URI</code> to your Project Settings &rarr; <em>Environment Variables</em> in the Vercel Dashboard.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: Export for MongoDB Atlas */}
        {activeTab === 'export' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center space-x-2">
                    <Download className="w-5 h-5 text-emerald-400" />
                    <span>Export Collections for MongoDB Atlas</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Download or copy full JSON documents with BSON compatibility for MongoDB Compass or <code className="text-emerald-300">mongoimport</code>.
                  </p>
                </div>
                <button
                  onClick={() => {
                    const json = StorageService.exportMongoJson();
                    navigator.clipboard.writeText(json);
                    alert('Copied MongoDB Collections JSON to clipboard!');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                >
                  Copy JSON to Clipboard
                </button>
              </div>

              <pre className="p-4 bg-slate-950 rounded-xl text-xs font-mono text-emerald-300 border border-slate-800 overflow-x-auto max-h-96">
                {StorageService.exportMongoJson()}
              </pre>
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Modal when Saved */}
      {saveSuccessModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Document Processed & Saved!</h3>
                <p className="text-xs text-slate-400">Document and crop records persisted with verified status.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Document ID:</span>
                <span className="font-mono text-emerald-300 font-semibold">{saveSuccessModal.docId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Records Processed:</span>
                <span className="font-semibold text-white">{saveSuccessModal.count} crops</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Local Database:</span>
                <span className="text-emerald-400 font-bold uppercase">SAVED (VERIFIED)</span>
              </div>

              {/* MongoDB Atlas Status Row */}
              <div className="flex justify-between pt-1 border-t border-slate-800">
                <span className="text-slate-400">MongoDB Atlas:</span>
                {saveSuccessModal.atlasStatus === 'saved' ? (
                  <span className="text-emerald-400 font-bold flex items-center space-x-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>Live Synced to Atlas</span>
                  </span>
                ) : saveSuccessModal.atlasStatus === 'failed' ? (
                  <span className="text-rose-400 font-bold">Upload Failed ⚠️</span>
                ) : (
                  <span className="text-amber-400 font-medium">Not Configured</span>
                )}
              </div>
            </div>

            {saveSuccessModal.atlasStatus !== 'saved' && (
              <div className="p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-lg text-[11px] text-amber-200 space-y-1">
                <div><strong>Note:</strong> {saveSuccessModal.atlasMessage}</div>
                {saveSuccessModal.atlasHint && (
                  <div className="text-slate-300 font-sans">{saveSuccessModal.atlasHint}</div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              {saveSuccessModal.atlasStatus !== 'saved' && (
                <button
                  onClick={() => {
                    setSaveSuccessModal({ ...saveSuccessModal, isOpen: false });
                    setActiveTab('mongodb');
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow"
                >
                  <Server className="w-4 h-4" />
                  <span>Configure MongoDB Atlas Connection</span>
                </button>
              )}
              <button
                onClick={() => {
                  setSaveSuccessModal({ ...saveSuccessModal, isOpen: false });
                  setActiveTab('database');
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow"
              >
                <span>View in Database Explorer</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSaveSuccessModal({ ...saveSuccessModal, isOpen: false })}
                className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-400 transition-colors text-center cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
