import { useState } from 'react'
import { useParams, Link } from 'react-router'
import { trpc } from '@/providers/trpc'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  ArrowLeft,
  BookOpen,
  FileText,
  Layers,
  Zap,
  Loader2,
  Download,
  ExternalLink,
  Quote,
  Calendar,
  Users,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  PenTool,
  Eye,
  CheckSquare,
  XCircle,
} from 'lucide-react'

export default function Session() {
  const { id } = useParams<{ id: string }>()
  const sessionId = Number(id)

  const { data, isLoading, refetch } = trpc.search.getSession.useQuery({ sessionId })
  const { data: synthesis } = trpc.synthesis.get.useQuery({ sessionId })
  const { data: problemStatement } = trpc.statement.get.useQuery({ sessionId })
  trpc.latex.listBySession.useQuery({ sessionId })

  const runSynthesis = trpc.synthesis.run.useMutation({
    onSuccess: () => {
      toast.success('Synthesis complete!')
      refetch()
    },
    onError: (err) => toast.error(err.message),
  })

  const draftStatement = trpc.statement.draft.useMutation({
    onSuccess: () => {
      toast.success('Problem statement drafted!')
      refetch()
    },
    onError: (err) => toast.error(err.message),
  })

  const generateReview = trpc.latex.generateReview.useMutation({
    onSuccess: (data) => {
      setLatexContent(data.latex)
      toast.success('LaTeX literature review generated!')
    },
    onError: (err) => toast.error(err.message),
  })

  const generateSynLatex = trpc.latex.generateSynthesis.useMutation({
    onSuccess: (data) => {
      setLatexContent(data.latex)
      toast.success('LaTeX synthesis report generated!')
    },
    onError: (err) => toast.error(err.message),
  })

  const generateStatementLatex = trpc.latex.generateStatement.useMutation({
    onSuccess: (data) => {
      setLatexContent(data.latex)
      toast.success('LaTeX problem statement generated!')
    },
    onError: (err) => toast.error(err.message),
  })

  const generateFull = trpc.latex.generateFullPipeline.useMutation({
    onSuccess: (data) => {
      setLatexContent(data.latex)
      toast.success('Full pipeline LaTeX generated!')
    },
    onError: (err) => toast.error(err.message),
  })

  const approveStatement = trpc.statement.approve.useMutation({
    onSuccess: () => {
      toast.success('Problem statement approved!')
      refetch()
    },
    onError: (err) => toast.error(err.message),
  })

  const rejectStatement = trpc.statement.reject.useMutation({
    onSuccess: () => {
      toast.success('Problem statement rejected with feedback')
      refetch()
    },
    onError: (err) => toast.error(err.message),
  })

  const [latexContent, setLatexContent] = useState('')
  const [activeTab, setActiveTab] = useState('papers')
  const [selectedGapIndex, setSelectedGapIndex] = useState(0)
  const [feedback, setFeedback] = useState('')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700">Session not found</h3>
        <Link to="/" className="text-blue-600 hover:underline mt-2 inline-block">
          Start a new search
        </Link>
      </div>
    )
  }

  const { session, papers } = data
  const statusColors: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600',
    searching: 'bg-blue-100 text-blue-700 animate-pulse',
    extracting: 'bg-blue-100 text-blue-700 animate-pulse',
    synthesizing: 'bg-indigo-100 text-indigo-700 animate-pulse',
    drafting: 'bg-purple-100 text-purple-700 animate-pulse',
    completed: 'bg-emerald-100 text-emerald-700',
    error: 'bg-red-100 text-red-700',
  }

  const canDraftStatement = synthesis && (session.status === 'drafting' || session.status === 'completed')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="flex items-center gap-1 text-sm text-slate-400 hover:text-blue-600 transition-colors mb-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Search
          </Link>
          <h2 className="text-2xl font-bold text-slate-800">{session.topic}</h2>
          <div className="flex items-center gap-3 mt-2">
            <Badge className={statusColors[session.status] || 'bg-slate-100'}>
              {session.status}
            </Badge>
            <Badge variant="outline">{session.bibFormat}</Badge>
            <Badge variant="outline">{session.version.toUpperCase()}</Badge>
            <span className="text-sm text-slate-400">
              {papers.length} papers found
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {latexContent && (
            <Button
              variant="outline"
              onClick={() => {
                const blob = new Blob([latexContent], { type: 'text/x-tex' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `research-review-${sessionId}.tex`
                a.click()
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              Download .tex
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline Progress */}
      <PipelineProgress
        status={session.status}
        version={session.version}
        hasSynthesis={!!synthesis}
        hasStatement={!!problemStatement}
      />

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        {session.status === 'synthesizing' && !synthesis && (
          <Button
            onClick={() => runSynthesis.mutate({ sessionId })}
            disabled={runSynthesis.isPending}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {runSynthesis.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Layers className="w-4 h-4 mr-2" />
            )}
            Run Cross-Study Synthesis (V2)
          </Button>
        )}

        {canDraftStatement && (
          <Button
            onClick={() => draftStatement.mutate({ sessionId, selectedGapIndex })}
            disabled={draftStatement.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {draftStatement.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <PenTool className="w-4 h-4 mr-2" />
            )}
            Draft Problem Statement (V3)
          </Button>
        )}

        {papers.length > 0 && (
          <Button variant="outline" onClick={() => generateReview.mutate({ sessionId })} disabled={generateReview.isPending}>
            <FileText className="w-4 h-4 mr-2" />
            {generateReview.isPending ? 'Generating...' : 'LaTeX: Literature Review'}
          </Button>
        )}

        {synthesis && (
          <Button variant="outline" onClick={() => generateSynLatex.mutate({ sessionId })} disabled={generateSynLatex.isPending}>
            <Layers className="w-4 h-4 mr-2" />
            {generateSynLatex.isPending ? 'Generating...' : 'LaTeX: Synthesis'}
          </Button>
        )}

        {problemStatement && (
          <Button variant="outline" onClick={() => generateStatementLatex.mutate({ sessionId })} disabled={generateStatementLatex.isPending}>
            <PenTool className="w-4 h-4 mr-2" />
            {generateStatementLatex.isPending ? 'Generating...' : 'LaTeX: Problem Statement'}
          </Button>
        )}

        {session.version === 'v3' && synthesis && problemStatement && (
          <Button variant="outline" onClick={() => generateFull.mutate({ sessionId })} disabled={generateFull.isPending}>
            <Zap className="w-4 h-4 mr-2" />
            {generateFull.isPending ? 'Generating...' : 'LaTeX: Full Pipeline'}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="papers" className="data-[state=active]:bg-white">
            <BookOpen className="w-4 h-4 mr-1.5" />
            Papers ({papers.length})
          </TabsTrigger>
          {synthesis && (
            <TabsTrigger value="synthesis" className="data-[state=active]:bg-white">
              <Layers className="w-4 h-4 mr-1.5" />
              Synthesis
            </TabsTrigger>
          )}
          {problemStatement && (
            <TabsTrigger value="statement" className="data-[state=active]:bg-white">
              <PenTool className="w-4 h-4 mr-1.5" />
              Problem Statement
            </TabsTrigger>
          )}
          {latexContent && (
            <TabsTrigger value="latex" className="data-[state=active]:bg-white">
              <FileText className="w-4 h-4 mr-1.5" />
              LaTeX Output
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="papers" className="mt-4">
          <PapersTab papers={papers} />
        </TabsContent>

        {synthesis && (
          <TabsContent value="synthesis" className="mt-4">
            <SynthesisTab
              synthesis={synthesis}
              selectedGapIndex={selectedGapIndex}
              onSelectGap={setSelectedGapIndex}
            />
          </TabsContent>
        )}

        {problemStatement && (
          <TabsContent value="statement" className="mt-4">
            <StatementTab
              statement={problemStatement}
              feedback={feedback}
              setFeedback={setFeedback}
              onApprove={(f) => approveStatement.mutate({ sessionId, feedback: f })}
              onReject={(f) => rejectStatement.mutate({ sessionId, feedback: f })}
            />
          </TabsContent>
        )}

        {latexContent && (
          <TabsContent value="latex" className="mt-4">
            <LatexTab content={latexContent} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

// ============================================================================
// Pipeline Progress Component
// ============================================================================
function PipelineProgress({
  status,
  version,
  hasSynthesis,
  hasStatement,
}: {
  status: string
  version: string
  hasSynthesis: boolean
  hasStatement: boolean
}) {
  const steps = [
    { key: 'search', label: 'Search', icon: <BookOpen className="w-4 h-4" /> },
    { key: 'synthesis', label: 'Synthesis', icon: <Layers className="w-4 h-4" /> },
    { key: 'statement', label: 'Problem Statement', icon: <PenTool className="w-4 h-4" /> },
    { key: 'latex', label: 'LaTeX Export', icon: <FileText className="w-4 h-4" /> },
  ]

  const getStepStatus = (stepKey: string) => {
    if (stepKey === 'search') {
      if (['searching', 'extracting'].includes(status)) return 'active'
      if (hasSynthesis || hasStatement || status === 'completed') return 'completed'
      return 'pending'
    }
    if (stepKey === 'synthesis') {
      if (status === 'synthesizing') return 'active'
      if (hasSynthesis || hasStatement || status === 'completed') return 'completed'
      return 'pending'
    }
    if (stepKey === 'statement') {
      if (status === 'drafting') return 'active'
      if (hasStatement) return 'completed'
      return version === 'mvp' ? 'skipped' : 'pending'
    }
    if (stepKey === 'latex') {
      if (status === 'completed') return 'completed'
      return 'pending'
    }
    return 'pending'
  }

  return (
    <Card className="border-slate-200">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          {steps.map((step, i) => {
            const stepStatus = getStepStatus(step.key)
            const isLast = i === steps.length - 1

            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      stepStatus === 'completed'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-600'
                        : stepStatus === 'active'
                        ? 'bg-blue-50 border-blue-400 text-blue-600 animate-pulse'
                        : stepStatus === 'skipped'
                        ? 'bg-slate-50 border-slate-200 text-slate-300'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    {stepStatus === 'completed' ? <CheckCircle className="w-5 h-5" /> : step.icon}
                  </div>
                  <span
                    className={`text-[10px] mt-1.5 font-medium ${
                      stepStatus === 'completed'
                        ? 'text-emerald-600'
                        : stepStatus === 'active'
                        ? 'text-blue-600'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className={`flex-1 h-0.5 mx-3 ${
                      stepStatus === 'completed' ? 'bg-emerald-300' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Papers Tab
// ============================================================================
function PapersTab({ papers }: { papers: any[] }) {
  if (papers.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>No papers found yet. Run a search to populate this list.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={<BookOpen className="w-5 h-5 text-blue-600" />} label="Total Papers" value={papers.length} />
        <StatCard
          icon={<BarChart3 className="w-5 h-5 text-indigo-600" />}
          label="Avg Citations"
          value={Math.round(papers.reduce((s, p) => s + (p.citationCount || 0), 0) / papers.length)}
        />
        <StatCard
          icon={<Calendar className="w-5 h-5 text-emerald-600" />}
          label="Year Range"
          value={`${Math.min(...papers.map((p) => p.year))}-${Math.max(...papers.map((p) => p.year))}`}
        />
        <StatCard
          icon={<ExternalLink className="w-5 h-5 text-amber-600" />}
          label="Open Access"
          value={papers.filter((p) => p.pdfUrl).length}
        />
      </div>

      {/* Paper Cards */}
      {papers.map((paper, index) => (
        <Card key={paper.id} className="border-slate-200 hover:border-blue-200 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <Badge variant="outline" className="mb-2 text-[10px]">
                  #{index + 1}
                </Badge>
                <CardTitle className="text-base font-semibold text-slate-800 leading-snug">
                  {paper.title}
                </CardTitle>
                <CardDescription className="mt-1">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    {paper.authors?.join(', ') || 'Unknown authors'}
                  </span>
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Badge className="bg-blue-50 text-blue-700">
                  <Quote className="w-3 h-3 mr-1" />
                  {paper.citationCount || 0}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2 text-xs text-slate-500 mb-3">
              {paper.journal && <span className="bg-slate-50 px-2 py-1 rounded">{paper.journal}</span>}
              {paper.year && <span className="bg-slate-50 px-2 py-1 rounded">{paper.year}</span>}
              {paper.volume && <span className="bg-slate-50 px-2 py-1 rounded">Vol. {paper.volume}</span>}
              {paper.doi && (
                <a
                  href={`https://doi.org/${paper.doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  DOI
                </a>
              )}
              {paper.url && (
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Source
                </a>
              )}
              {paper.pdfUrl && (
                <a
                  href={paper.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:underline flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  PDF
                </a>
              )}
            </div>
            {paper.abstract && (
              <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">{paper.abstract}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white border border-slate-100 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  )
}

// ============================================================================
// Synthesis Tab
// ============================================================================
function SynthesisTab({
  synthesis,
  selectedGapIndex,
  onSelectGap,
}: {
  synthesis: any
  selectedGapIndex: number
  onSelectGap: (i: number) => void
}) {
  const sections = [
    { key: 'methodologicalPatterns', label: 'Methodological Patterns', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'overarchingFindings', label: 'Overarching Findings', icon: <Sparkles className="w-4 h-4" /> },
    { key: 'recurringGaps', label: 'Recurring Gaps', icon: <AlertTriangle className="w-4 h-4" /> },
    { key: 'impactAssessment', label: 'Impact Assessment', icon: <Eye className="w-4 h-4" /> },
    { key: 'futureDirections', label: 'Future Directions', icon: <Zap className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        {sections.map((section) => (
          <Card key={section.key} className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
                {section.icon}
                {section.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                {synthesis[section.key] || 'No data available.'}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Identified Gaps */}
      {synthesis.identifiedGaps && synthesis.identifiedGaps.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              Identified Gaps ({synthesis.identifiedGaps.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {synthesis.identifiedGaps.map((gap: string, i: number) => (
              <button
                key={i}
                onClick={() => onSelectGap(i)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                  selectedGapIndex === i
                    ? 'border-amber-400 bg-amber-100/50 shadow-sm'
                    : 'border-amber-100 bg-white hover:border-amber-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    className={
                      selectedGapIndex === i
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-100 text-amber-700'
                    }
                  >
                    Gap {i + 1}
                  </Badge>
                  {selectedGapIndex === i && (
                    <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">
                      Selected for Problem Statement
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-700">{gap}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Problem Statement Tab
// ============================================================================
function StatementTab({
  statement,
  feedback,
  setFeedback,
  onApprove,
  onReject,
}: {
  statement: any
  feedback: string
  setFeedback: (s: string) => void
  onApprove: (f: string) => void
  onReject: (f: string) => void
}) {
  const statusConfig = {
    draft: { color: 'bg-slate-100 text-slate-600', label: 'Draft' },
    review_pending: { color: 'bg-amber-100 text-amber-700', label: 'Under Review' },
    approved: { color: 'bg-emerald-100 text-emerald-700', label: 'Approved' },
    rejected: { color: 'bg-red-100 text-red-700', label: 'Rejected' },
  }

  const config = statusConfig[statement.status as keyof typeof statusConfig] || statusConfig.draft

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className="flex items-center justify-between">
        <Badge className={config.color}>{config.label}</Badge>
        {statement.status === 'approved' && (
          <span className="flex items-center gap-1 text-sm text-emerald-600">
            <CheckCircle className="w-4 h-4" />
            Problem statement approved and ready for use
          </span>
        )}
      </div>

      {/* Statement Sections */}
      <div className="grid gap-4">
        {[
          { key: 'whatIsKnown', label: 'What is Known', icon: <BookOpen className="w-4 h-4" /> },
          { key: 'whatIsMissing', label: 'What is Missing', icon: <AlertTriangle className="w-4 h-4" /> },
          { key: 'affectedStakeholders', label: 'Affected Stakeholders', icon: <Users className="w-4 h-4" /> },
          { key: 'consequencesOfInaction', label: 'Consequences of Inaction', icon: <AlertTriangle className="w-4 h-4" /> },
          { key: 'howStudyAddressesGap', label: 'How the Study Addresses the Gap', icon: <Zap className="w-4 h-4" /> },
        ].map((section) => (
          <Card key={section.key} className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
                {section.icon}
                {section.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 leading-relaxed">{statement[section.key] || '[Not specified]'}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Full Statement */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2 text-blue-700">
            <FileText className="w-4 h-4" />
            Full Problem Statement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{statement.fullStatement || '[Draft not yet generated]'}</p>
        </CardContent>
      </Card>

      {/* Human Approval Gates */}
      {statement.status !== 'approved' && (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckSquare className="w-4 h-4" />
              Human Approval Gate
            </CardTitle>
            <CardDescription>
              Review the problem statement and provide feedback. This gate ensures scholarly quality.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Validation Checklist */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Validation Checklist:</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  'Is the problem researchable?',
                  'Is the gap demonstrable?',
                  'Is the challenge measurable?',
                  'Are stakeholders identified?',
                  'Are consequences articulated?',
                  'Does it answer why, what, and how?',
                ].map((item, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" className="rounded text-blue-600" />
                    {item}
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            {/* Feedback */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Feedback (required for reject, optional for approve)</Label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Enter your feedback, suggestions for revision, or approval notes..."
                className="w-full min-h-[80px] p-3 text-sm border border-slate-200 rounded-lg focus:border-blue-300 focus:ring-1 focus:ring-blue-200 resize-y"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={() => onApprove(feedback)}
                className="bg-emerald-600 hover:bg-emerald-700 flex-1"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve Statement
              </Button>
              <Button
                onClick={() => onReject(feedback)}
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 flex-1"
                disabled={!feedback.trim()}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject & Request Revision
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feedback Display */}
      {statement.humanFeedback && (
        <Card className="border-slate-200 bg-slate-50/50">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-slate-600">
              <PenTool className="w-4 h-4" />
              Human Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 italic">{statement.humanFeedback}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// LaTeX Preview Tab
// ============================================================================
function LatexTab({ content }: { content: string }) {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" />
          LaTeX Source Code
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="bg-slate-900 text-slate-100 p-6 rounded-lg text-xs leading-relaxed overflow-x-auto max-h-[800px] overflow-y-auto">
          {content}
        </pre>
      </CardContent>
    </Card>
  )
}
