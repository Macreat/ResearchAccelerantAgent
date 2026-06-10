import { useState } from 'react'
import { useNavigate } from 'react-router'
import { trpc } from '@/providers/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Search,
  BookOpen,
  Database,
  Calendar,
  Quote,
  Filter,
  Sparkles,
  Layers,
  Zap,
  ChevronRight,
  Loader2,
} from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const [keywords, setKeywords] = useState('')
  const [numStudies, setNumStudies] = useState(5)
  const [yearFrom, setYearFrom] = useState(2023)
  const [yearTo, setYearTo] = useState(2026)
  const [citationMin, setCitationMin] = useState(1)
  const [databases, setDatabases] = useState(['google_scholar', 'semantic_scholar', 'openalex'])
  const [bibFormat, setBibFormat] = useState<'APA' | 'MLA' | 'Chicago' | 'IEEE' | 'BibTeX'>('APA')
  const [version, setVersion] = useState<'mvp' | 'v2' | 'v3'>('v3')
  const [inclusionCriteria, setInclusionCriteria] = useState('')
  const [exclusionCriteria, setExclusionCriteria] = useState('')

  const createSession = trpc.search.createSession.useMutation()
  const executeSearch = trpc.search.execute.useMutation()

  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = async () => {
    if (!topic.trim()) {
      toast.error('Please enter a research topic')
      return
    }

    setIsSearching(true)
    try {
      // Step 1: Create session
      const { sessionId } = await createSession.mutateAsync({
        topic,
        numStudies,
        yearFrom,
        yearTo,
        citationMin,
        databases: databases.join(','),
        keywords: keywords || undefined,
        inclusionCriteria: inclusionCriteria || undefined,
        exclusionCriteria: exclusionCriteria || undefined,
        bibFormat,
        version,
      })

      toast.success('Search session created! Searching academic databases...')

      // Step 2: Execute search
      const result = await executeSearch.mutateAsync({ sessionId })

      toast.success(`Found ${result.papersFound} papers!`)

      // Navigate to session page
      navigate(`/session/${sessionId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed'
      toast.error(message)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Hero */}
      <div className="text-center space-y-4 py-8">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-sm font-medium border border-blue-100">
          <Sparkles className="w-4 h-4" />
          Agentic Research Assistant
        </div>
        <h2 className="text-4xl font-bold text-slate-800">
          From Search to
          <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent"> Problem Statement</span>
        </h2>
        <p className="text-slate-500 max-w-2xl mx-auto text-lg">
          Automate your literature review workflow. Search academic databases, synthesize findings,
          identify gaps, and draft publication-ready problem statements — all in one pipeline.
        </p>
      </div>

      {/* Version Selector */}
      <div className="grid grid-cols-3 gap-4">
        <VersionCard
          title="MVP — Search & Format"
          description="Search academic databases and generate LaTeX-formatted literature reviews"
          icon={<Search className="w-5 h-5" />}
          active={version === 'mvp'}
          onClick={() => setVersion('mvp')}
          badge="Search → LaTeX"
        />
        <VersionCard
          title="V2 — Synthesis Agent"
          description="Cross-study synthesis with automatic gap detection and thematic analysis"
          icon={<Layers className="w-5 h-5" />}
          active={version === 'v2'}
          onClick={() => setVersion('v2')}
          badge="Search → Synthesis → LaTeX"
        />
        <VersionCard
          title="V3 — Full Pipeline"
          description="Complete pipeline: search, synthesis, gap selection, problem statement drafting"
          icon={<Zap className="w-5 h-5" />}
          active={version === 'v3'}
          onClick={() => setVersion('v3')}
          badge="Full Pipeline + Human Gates"
        />
      </div>

      {/* Search Form */}
      <Card className="border-blue-100 shadow-lg shadow-blue-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Search className="w-5 h-5 text-blue-600" />
            Configure Literature Search
          </CardTitle>
          <CardDescription>
            Define your search parameters. The agent will query Semantic Scholar and OpenAlex.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Topic */}
          <div className="space-y-2">
            <Label htmlFor="topic" className="text-sm font-semibold text-slate-700">
              Research Topic *
            </Label>
            <Textarea
              id="topic"
              placeholder="e.g., Machine learning approaches for early detection of Alzheimer's disease"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="min-h-[80px] border-slate-200 focus:border-blue-300 focus:ring-blue-200"
            />
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <Label htmlFor="keywords" className="text-sm font-semibold text-slate-700">
              Search Keywords <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="keywords"
              placeholder="e.g., deep learning, neural networks, biomarkers, early diagnosis"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="border-slate-200 focus:border-blue-300 focus:ring-blue-200"
            />
          </div>

          <Separator />

          {/* Search Parameters Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                Max Studies
              </Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={numStudies}
                onChange={(e) => setNumStudies(Number(e.target.value))}
                className="border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                Year From
              </Label>
              <Input
                type="number"
                min={1900}
                max={2100}
                value={yearFrom}
                onChange={(e) => setYearFrom(Number(e.target.value))}
                className="border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                Year To
              </Label>
              <Input
                type="number"
                min={1900}
                max={2100}
                value={yearTo}
                onChange={(e) => setYearTo(Number(e.target.value))}
                className="border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Quote className="w-3.5 h-3.5 text-blue-500" />
                Min Citations
              </Label>
              <Input
                type="number"
                min={0}
                value={citationMin}
                onChange={(e) => setCitationMin(Number(e.target.value))}
                className="border-slate-200"
              />
            </div>
          </div>

          {/* Databases */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Database className="w-3.5 h-3.5 text-blue-500" />
              Databases
            </Label>
            <div className="flex gap-3 flex-wrap">
              <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white cursor-pointer hover:border-blue-300 transition-colors">
                <input
                  type="checkbox"
                  checked={databases.includes('google_scholar')}
                  onChange={(e) => {
                    if (e.target.checked) setDatabases([...databases, 'google_scholar'])
                    else setDatabases(databases.filter((d) => d !== 'google_scholar'))
                  }}
                  className="rounded text-blue-600"
                />
                <span className="text-sm text-slate-700 font-medium">Google Scholar (SerpAPI)</span>
              </label>
              <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white cursor-pointer hover:border-blue-300 transition-colors">
                <input
                  type="checkbox"
                  checked={databases.includes('semantic_scholar')}
                  onChange={(e) => {
                    if (e.target.checked) setDatabases([...databases, 'semantic_scholar'])
                    else setDatabases(databases.filter((d) => d !== 'semantic_scholar'))
                  }}
                  className="rounded text-blue-600"
                />
                <span className="text-sm text-slate-700">Semantic Scholar</span>
              </label>
              <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white cursor-pointer hover:border-blue-300 transition-colors">
                <input
                  type="checkbox"
                  checked={databases.includes('openalex')}
                  onChange={(e) => {
                    if (e.target.checked) setDatabases([...databases, 'openalex'])
                    else setDatabases(databases.filter((d) => d !== 'openalex'))
                  }}
                  className="rounded text-blue-600"
                />
                <span className="text-sm text-slate-700">OpenAlex</span>
              </label>
            </div>
          </div>

          {/* Bibliographic Format */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Quote className="w-3.5 h-3.5 text-blue-500" />
              Citation Format
            </Label>
            <div className="flex gap-2 flex-wrap">
              {(['APA', 'MLA', 'Chicago', 'IEEE', 'BibTeX'] as const).map((format) => (
                <button
                  key={format}
                  onClick={() => setBibFormat(format)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    bibFormat === format
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {format}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Criteria */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Filter className="w-3.5 h-3.5 text-emerald-500" />
                Inclusion Criteria
              </Label>
              <Textarea
                placeholder="e.g., peer-reviewed, English language, human subjects"
                value={inclusionCriteria}
                onChange={(e) => setInclusionCriteria(e.target.value)}
                className="min-h-[60px] border-slate-200 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Filter className="w-3.5 h-3.5 text-orange-500" />
                Exclusion Criteria
              </Label>
              <Textarea
                placeholder="e.g., editorials, conference abstracts, preprints"
                value={exclusionCriteria}
                onChange={(e) => setExclusionCriteria(e.target.value)}
                className="min-h-[60px] border-slate-200 text-sm"
              />
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSearch}
            disabled={isSearching || !topic.trim()}
            className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200 transition-all hover:shadow-xl hover:shadow-blue-300"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Searching Academic Databases...
              </>
            ) : (
              <>
                <Search className="w-5 h-5 mr-2" />
                Launch Search Pipeline
                <ChevronRight className="w-5 h-5 ml-2" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Features */}
      <div className="grid grid-cols-3 gap-6">
        <FeatureCard
          icon={<Database className="w-6 h-6 text-blue-600" />}
          title="Multi-Database Search"
          description="Query Semantic Scholar and OpenAlex simultaneously for comprehensive coverage"
        />
        <FeatureCard
          icon={<Layers className="w-6 h-6 text-indigo-600" />}
          title="Auto-Synthesis"
          description="Extract themes, detect contradictions, and identify methodological patterns across studies"
        />
        <FeatureCard
          icon={<Zap className="w-6 h-6 text-amber-600" />}
          title="LaTeX Export"
          description="Generate publication-ready LaTeX documents in APA, MLA, IEEE, or BibTeX format"
        />
      </div>
    </div>
  )
}

function VersionCard({
  title,
  description,
  icon,
  active,
  onClick,
  badge,
}: {
  title: string
  description: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  badge: string
}) {
  return (
    <button
      onClick={onClick}
      className={`relative text-left p-5 rounded-xl border-2 transition-all duration-200 ${
        active
          ? 'border-blue-500 bg-blue-50/50 shadow-md shadow-blue-100'
          : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'
      }`}
    >
      {active && (
        <div className="absolute -top-2 -right-2">
          <Badge className="bg-blue-600 text-white text-[10px] px-2 py-0.5">Selected</Badge>
        </div>
      )}
      <div className={`p-2 rounded-lg w-fit mb-3 ${active ? 'bg-blue-100' : 'bg-slate-100'}`}>
        {icon}
      </div>
      <h3 className="font-semibold text-slate-800 text-sm mb-1">{title}</h3>
      <p className="text-xs text-slate-500 mb-2">{description}</p>
      <Badge variant="outline" className="text-[10px]">
        {badge}
      </Badge>
    </button>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="bg-white/70 backdrop-blur-sm border border-slate-100 rounded-xl p-5 hover:shadow-md transition-shadow">
      <div className="p-2.5 bg-slate-50 rounded-lg w-fit mb-3">{icon}</div>
      <h3 className="font-semibold text-slate-800 text-sm mb-1">{title}</h3>
      <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
    </div>
  )
}
