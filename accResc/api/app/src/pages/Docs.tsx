import { useMemo, useState } from 'react'
import { trpc } from '@/providers/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { 
  CheckCircle2, 
  FileText, 
  Loader2, 
  MessageSquare, 
  RefreshCw, 
  Search, 
  Server, 
  XCircle,
  Download,
  Zap,
  FileType,
} from 'lucide-react'

type ChatMessage = {
  role: 'user' | 'agent'
  content: string
}

export default function Docs() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [reportTitle, setReportTitle] = useState('Local Research Agent Document Report')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const [isDeepMode, setIsDeepMode] = useState(false)

  const utils = trpc.useUtils()
  const health = trpc.docs.health.useQuery(undefined, { refetchInterval: 10000 })
  const docs = trpc.docs.search.useQuery({ query })
  const artifacts = trpc.docs.artifacts.useQuery()
  
  const scan = trpc.docs.scan.useMutation({
    onSuccess: async (result) => {
      toast.success(`Indexed ${result.indexed} local documents`)
      await utils.docs.search.invalidate()
      await utils.docs.health.invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const ask = trpc.docs.ask.useMutation({
    onSuccess: (result) => {
      setMessages((current) => [...current, { role: 'agent', content: result.answer }])
    },
    onError: (error) => toast.error(error.message),
  })

  const deepAsk = trpc.docs.deepAsk.useMutation({
    onSuccess: (result) => {
      setMessages((current) => [...current, { 
        role: 'agent', 
        content: `[Deep Analysis of ${result.document.title}]\n\n${result.answer}` 
      }])
    },
    onError: (error) => toast.error(error.message),
  })

  const generateTex = trpc.docs.generateTex.useMutation({
    onSuccess: async () => {
      toast.success('Generated LaTeX report')
      await utils.docs.artifacts.invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const compilePdf = trpc.docs.compilePdf.useMutation({
    onSuccess: async () => {
      toast.success('Compiled PDF report')
      await utils.docs.artifacts.invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const compileLocalTex = trpc.docs.compileLocalTex.useMutation({
    onSuccess: async () => {
      toast.success('Compiled TeX to PDF')
      await utils.docs.artifacts.invalidate()
    },
    onError: (error) => toast.error(error.message),
  })

  const downloadPdf = trpc.docs.downloadPdf.useMutation({
    onSuccess: (result) => {
      const link = document.createElement('a')
      link.href = `data:application/pdf;base64,${result.data}`
      link.download = result.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Download started')
    },
    onError: (error) => toast.error(error.message),
  })

  const downloadTex = trpc.docs.downloadTex.useMutation({
    onSuccess: (result) => {
      const link = document.createElement('a')
      link.href = `data:text/x-tex;base64,${result.data}`
      link.download = result.filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Download started')
    },
    onError: (error) => toast.error(error.message),
  })

  const documents = docs.data ?? []
  const selectedDocs = useMemo(
    () => documents.filter((doc) => selected.includes(doc.sha256)),
    [documents, selected],
  )

  const toggleDoc = (sha256: string) => {
    setSelected((current) => (
      current.includes(sha256)
        ? current.filter((id) => id !== sha256)
        : [...current, sha256]
    ))
  }

  const submitQuestion = async () => {
    const clean = question.trim()
    if (!clean) return

    if (isDeepMode) {
      if (selected.length === 0) {
        toast.error('Select at least one document in the index for Deep Research')
        return
      }
      setMessages((current) => [...current, { role: 'user', content: `[Deep] ${clean}` }])
      setQuestion('')
      await deepAsk.mutateAsync({ 
        documentId: selected[0], 
        question: clean 
      })
    } else {
      setMessages((current) => [...current, { role: 'user', content: clean }])
      setQuestion('')
      await ask.mutateAsync({ question: clean })
    }
  }

  const isPending = ask.isPending || deepAsk.isPending

  const runGenerateTex = async () => {
    if (selected.length === 0) {
      toast.error('Select at least one indexed PDF')
      return
    }
    await generateTex.mutateAsync({ documentIds: selected, title: reportTitle })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-slate-800">Local Linux Document Agent</h2>
        <p className="text-sm text-slate-500">
          Start the service from a terminal, enter this GUI, ask questions about local docs, and generate LaTeX/PDF reports.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatusCard label="Docs Mount" ok={health.data?.docsReady} detail={health.data?.docsDir} />
        <StatusCard label="Output Path" ok={health.data?.outputReady} detail={health.data?.outputDir} />
        <StatusCard label="Ollama" ok={health.data?.ollamaReady} detail={health.data?.ollamaUrl} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Indexed Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{health.data?.indexedDocuments ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-600" />
              Document Index
            </CardTitle>
            <CardDescription>The proof workflow reads PDFs and TeX files from the configured DOCS_DIR mount.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <Button onClick={() => scan.mutate()} disabled={scan.isPending}>
                {scan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Scan Documents
              </Button>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search filenames, standards, reports, or topics"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              {docs.isLoading ? (
                <div className="p-6 text-sm text-slate-500">Loading indexed documents...</div>
              ) : documents.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No indexed documents yet. Run a scan first.</div>
              ) : (
                <div className="max-h-[520px] divide-y divide-slate-100 overflow-auto">
                  {documents.map((doc) => (
                    <div
                      key={doc.sha256}
                      className="group flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50"
                    >
                      <input 
                        type="checkbox" 
                        checked={selected.includes(doc.sha256)} 
                        onChange={() => toggleDoc(doc.sha256)}
                        className="mt-1 cursor-pointer" 
                      />
                      {doc.type === 'tex' ? (
                        <FileType className="mt-0.5 h-5 w-5 text-amber-600" />
                      ) : (
                        <FileText className="mt-0.5 h-5 w-5 text-blue-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-800">{doc.title}</div>
                        <div className="truncate text-xs text-slate-500">{doc.relativePath}</div>
                        <div className="mt-1 text-xs text-slate-400">{doc.sizeBytes.toLocaleString()} bytes</div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={doc.type === 'tex' ? 'secondary' : 'outline'} className={doc.type === 'tex' ? 'bg-amber-100 text-amber-800 border-amber-200' : ''}>
                          {doc.type.toUpperCase()}
                        </Badge>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {doc.type === 'tex' && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              title="Compile to PDF"
                              onClick={(e) => {
                                e.stopPropagation()
                                compileLocalTex.mutate({ sha256: doc.sha256 })
                              }}
                              disabled={compileLocalTex.isPending}
                            >
                              {compileLocalTex.isPending && compileLocalTex.variables?.sha256 === doc.sha256 ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Zap className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                          {doc.type === 'tex' && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="Download .tex"
                              onClick={(e) => {
                                e.stopPropagation()
                                downloadTex.mutate({ sha256: doc.sha256 })
                              }}
                              disabled={downloadTex.isPending}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-600" />
              Agent Console
            </CardTitle>
            <CardDescription>Ask local questions or give orders related to the indexed docs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-[360px] space-y-3 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              {messages.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Try: "What ICNIRP documents are available?" or "Generate a report from the selected standards."
                </div>
              ) : (
                messages.map((message, index) => (
                  <div key={index} className={message.role === 'user' ? 'text-right' : 'text-left'}>
                    <div className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-700 shadow-sm'
                    }`}>
                      {message.content}
                    </div>
                  </div>
                ))
              )}
              {ask.isPending && <div className="text-sm text-slate-500">Agent is reading the local index...</div>}
            </div>
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about local documents, standards, reports, or generated outputs"
              className="min-h-[90px]"
            />
            <div className="flex items-center space-x-2 py-1">
              <input 
                type="checkbox" 
                id="deepMode" 
                checked={isDeepMode} 
                onChange={(e) => setIsDeepMode(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              />
              <label htmlFor="deepMode" className="text-sm font-medium text-slate-700 cursor-pointer">
                Deep Research Mode (Full PDF Extraction)
              </label>
            </div>
            <Button onClick={submitQuestion} disabled={isPending || !question.trim()} className="w-full">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send to Agent
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate Report</CardTitle>
          <CardDescription>Selected documents are converted into a local .tex report. PDF compilation requires pdflatex.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} />
            <Button onClick={runGenerateTex} disabled={generateTex.isPending || selected.length === 0}>
              {generateTex.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Generate .tex
            </Button>
          </div>
          <div className="text-sm text-slate-500">{selectedDocs.length} selected document{selectedDocs.length === 1 ? '' : 's'}</div>
          <Separator />
          <div className="space-y-3">
            {(artifacts.data ?? []).length === 0 ? (
              <div className="text-sm text-slate-500">No generated reports yet.</div>
            ) : (
              (artifacts.data ?? []).map((artifact) => (
                <div key={artifact.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium text-slate-800">{artifact.title}</div>
                    <div className="text-xs text-slate-500">{artifact.texPath}</div>
                    {artifact.pdfPath && <div className="text-xs text-emerald-600">{artifact.pdfPath}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => compilePdf.mutate({ artifactId: artifact.id })} 
                      disabled={compilePdf.isPending}
                    >
                      {compilePdf.isPending && artifact.id === compilePdf.variables?.artifactId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Zap className="w-3.5 h-3.5 mr-2" />
                      Compile PDF
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => downloadTex.mutate({ artifactId: artifact.id })} 
                      disabled={downloadTex.isPending}
                    >
                      {downloadTex.isPending && artifact.id === downloadTex.variables?.artifactId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <FileType className="w-3.5 h-3.5 mr-2" />
                      Download .tex
                    </Button>
                    {artifact.pdfPath && (
                      <Button 
                        variant="secondary" 
                        size="sm"
                        onClick={() => downloadPdf.mutate({ artifactId: artifact.id })} 
                        disabled={downloadPdf.isPending}
                      >
                        {downloadPdf.isPending && artifact.id === downloadPdf.variables?.artifactId && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        <Download className="w-3.5 h-3.5 mr-2" />
                        Download PDF
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusCard({ label, ok, detail }: { label: string; ok?: boolean; detail?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          {label}
          {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="truncate text-xs text-slate-500" title={detail}>{detail || 'Unavailable'}</div>
      </CardContent>
    </Card>
  )
}

