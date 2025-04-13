import { useEffect, useMemo, useState } from "react"
import { json, LoaderFunction } from "@remix-run/node"
import { useLoaderData, useSearchParams } from "@remix-run/react"
import {
  differenceInDays,
  endOfDay,
  format,
  isValid,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns"
import { formatInTimeZone, toZonedTime } from "date-fns-tz"
import { CalendarIcon } from "lucide-react"
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

import { prisma } from "@/services/db/db.server"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type DialerMetrics = {
  dialerId: string
  dialer: { firstName: string; lastName: string }
  dials: number
  connects: number
  conversations: number
  qualifiedConversations: number
  meetingsScheduled: number
  meetingsSet: number
  meetingsShowed: number
  noShows: number
  closedDeals: number
  revenueGenerated: number
  cashCollected: number
  date: string
}

type LoaderData = {
  dialersMetrics: DialerMetrics[]
  totals: {
    dials: number
    connects: number
    conversations: number
    qualifiedConversations: number
    meetingsScheduled: number
    meetingsSet: number
    meetingsShowed: number
    noShows: number
    closedDeals: number
    revenueGenerated: number
    cashCollected: number
  }
  previousTotals: {
    dials: number
    connects: number
    conversations: number
    qualifiedConversations: number
    meetingsSet: number
    meetingsShowed: number
    closedDeals: number
  }
  daysInRange: number
  daysInPreviousRange: number
  userTimeZone: string
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url)
  const range = url.searchParams.get("range") || "30d"
  const startDate = url.searchParams.get("startDate")
  const endDate = url.searchParams.get("endDate")
  const dialerId = url.searchParams.get("dialerId")
  const userTimeZone = url.searchParams.get("tz") || "UTC"

  let start: Date
  let end: Date
  let previousStart: Date
  let previousEnd: Date
  let daysInRange: number
  let daysInPreviousRange: number

  const now = toZonedTime(new Date(), userTimeZone)
  end = endOfDay(now)

  if (range === "custom" && startDate && endDate) {
    const parsedStart = parseISO(startDate)
    const parsedEnd = parseISO(endDate)
    if (isValid(parsedStart) && isValid(parsedEnd)) {
      start = toZonedTime(parsedStart, userTimeZone)
      start = startOfDay(start)
      end = toZonedTime(parsedEnd, userTimeZone)
      end = endOfDay(end)
      daysInRange = differenceInDays(end, start) + 1
      previousStart = subDays(start, daysInRange)
      previousStart = startOfDay(previousStart)
      previousEnd = subDays(end, daysInRange)
      previousEnd = endOfDay(previousEnd)
      daysInPreviousRange = daysInRange
    } else {
      start = subDays(end, 30)
      start = startOfDay(start)
      end = endOfDay(end)
      daysInRange = 30
      previousStart = subDays(start, 30)
      previousStart = startOfDay(previousStart)
      previousEnd = subDays(end, 30)
      previousEnd = endOfDay(previousEnd)
      daysInPreviousRange = 30
    }
  } else if (range === "24h") {
    start = startOfDay(now)
    end = endOfDay(now)
    daysInRange = 1
    previousStart = subDays(start, 1)
    previousStart = startOfDay(previousStart)
    previousEnd = subDays(end, 1)
    previousEnd = endOfDay(previousEnd)
    daysInPreviousRange = 1
  } else if (range === "7d") {
    start = subDays(end, 6)
    start = startOfDay(start)
    daysInRange = 7
    previousStart = subDays(start, 7)
    previousStart = startOfDay(previousStart)
    previousEnd = subDays(end, 7)
    previousEnd = endOfDay(previousEnd)
    daysInPreviousRange = 7
  } else {
    start = subDays(end, 29)
    start = startOfDay(start)
    daysInRange = 30
    previousStart = subDays(start, 30)
    previousStart = startOfDay(previousStart)
    previousEnd = subDays(end, 30)
    previousEnd = endOfDay(previousEnd)
    daysInPreviousRange = 30
  }

  const dialersMetricsRaw = await prisma.dialerMetrics.findMany({
    where: {
      date: {
        gte: start,
        lte: end,
      },
      ...(dialerId && { dialerId }),
    },
    include: {
      dialer: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: [{ dialerId: "asc" }, { date: "desc" }],
  })

  const previousMetricsRaw = await prisma.dialerMetrics.findMany({
    where: {
      date: {
        gte: previousStart,
        lte: previousEnd,
      },
      ...(dialerId && { dialerId }),
    },
  })

  const dialersMetrics = dialersMetricsRaw.map((metric) => ({
    ...metric,
    date: metric.date.toISOString(),
  }))

  const totals = dialersMetrics.reduce(
    (acc, metric) => ({
      dials: acc.dials + metric.dials,
      connects: acc.connects + metric.connects,
      conversations: acc.conversations + metric.conversations,
      qualifiedConversations:
        acc.qualifiedConversations + metric.qualifiedConversations,
      meetingsScheduled: acc.meetingsScheduled + metric.meetingsScheduled,
      meetingsSet: acc.meetingsSet + metric.meetingsSet,
      meetingsShowed: acc.meetingsShowed + metric.meetingsShowed,
      noShows: acc.noShows + metric.noShows,
      closedDeals: acc.closedDeals + metric.closedDeals,
      revenueGenerated: acc.revenueGenerated + metric.revenueGenerated,
      cashCollected: acc.cashCollected + metric.cashCollected,
    }),
    {
      dials: 0,
      connects: 0,
      conversations: 0,
      qualifiedConversations: 0,
      meetingsScheduled: 0,
      meetingsSet: 0,
      meetingsShowed: 0,
      noShows: 0,
      closedDeals: 0,
      revenueGenerated: 0,
      cashCollected: 0,
    }
  )

  const previousTotals = previousMetricsRaw.reduce(
    (acc, metric) => ({
      dials: acc.dials + metric.dials,
      connects: acc.connects + metric.connects,
      conversations: acc.conversations + metric.conversations,
      qualifiedConversations:
        acc.qualifiedConversations + metric.qualifiedConversations,
      meetingsSet: acc.meetingsSet + metric.meetingsSet,
      meetingsShowed: acc.meetingsShowed + metric.meetingsShowed,
      closedDeals: acc.closedDeals + metric.closedDeals,
    }),
    {
      dials: 0,
      connects: 0,
      conversations: 0,
      qualifiedConversations: 0,
      meetingsSet: 0,
      meetingsShowed: 0,
      closedDeals: 0,
    }
  )

  return json<LoaderData>({
    dialersMetrics,
    totals,
    previousTotals,
    daysInRange,
    daysInPreviousRange,
    userTimeZone,
  })
}

export default function DialersAnalytics() {
  const {
    dialersMetrics,
    totals,
    previousTotals,
    daysInRange,
    daysInPreviousRange,
    userTimeZone,
  } = useLoaderData<LoaderData>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()

  // Get selected dialer from search params
  const selectedDialerId = searchParams.get("dialerId") || ""

  // Get unique dialers for dropdown
  const dialers = useMemo(() => {
    const uniqueDialers = Array.from(
      new Map(
        dialersMetrics.map((metric) => [
          metric.dialerId,
          {
            id: metric.dialerId,
            name: `${metric.dialer.firstName} ${metric.dialer.lastName}`,
          },
        ])
      ).values()
    )
    return uniqueDialers.sort((a, b) => a.name.localeCompare(b.name))
  }, [dialersMetrics])

  useEffect(() => {
    const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (clientTimeZone !== userTimeZone) {
      setSearchParams(
        (prev) => {
          prev.set("tz", clientTimeZone)
          return prev
        },
        { replace: true }
      )
    }
  }, [userTimeZone, setSearchParams])

  const handleRangeChange = (range: string) => {
    setSearchParams(
      (prev) => {
        prev.set("range", range)
        if (range !== "custom") {
          prev.delete("startDate")
          prev.delete("endDate")
        }
        return prev
      },
      { replace: true }
    )
    setStartDate(undefined)
    setEndDate(undefined)
  }

  const handleCustomDateSubmit = () => {
    if (startDate && endDate) {
      const formattedStart = formatInTimeZone(
        startDate,
        userTimeZone,
        "yyyy-MM-dd"
      )
      const formattedEnd = formatInTimeZone(endDate, userTimeZone, "yyyy-MM-dd")
      setSearchParams(
        {
          range: "custom",
          startDate: formattedStart,
          endDate: formattedEnd,
          tz: userTimeZone,
          ...(selectedDialerId && { dialerId: selectedDialerId }),
        },
        { replace: true }
      )
    }
  }

  const handleDialerChange = (dialerId: string) => {
    setSearchParams(
      (prev) => {
        if (dialerId) {
          prev.set("dialerId", dialerId)
        } else {
          prev.delete("dialerId")
        }
        return prev
      },
      { replace: true }
    )
  }

  const dialsWidth = 100
  const connectsWidth =
    totals.dials > 0 ? (totals.connects / totals.dials) * 100 : 0
  const conversationsWidth =
    totals.dials > 0 ? (totals.conversations / totals.dials) * 100 : 0
  const qualifiedConversationsWidth =
    totals.dials > 0 ? (totals.qualifiedConversations / totals.dials) * 100 : 0
  const meetingsSetWidth =
    totals.dials > 0 ? (totals.meetingsSet / totals.dials) * 100 : 0

  const avgDialsPerDay =
    daysInRange > 0 ? Math.round(totals.dials / daysInRange) : 0
  const avgConnectsPerDay =
    daysInRange > 0 ? Math.round(totals.connects / daysInRange) : 0
  const avgConversationsPerDay =
    daysInRange > 0 ? Math.round(totals.conversations / daysInRange) : 0
  const avgQualifiedConversationsPerDay =
    daysInRange > 0
      ? Math.round(totals.qualifiedConversations / daysInRange)
      : 0
  const avgMeetingsSetPerDay =
    daysInRange > 0 ? Math.round(totals.meetingsSet / daysInRange) : 0

  const prevAvgDialsPerDay =
    daysInPreviousRange > 0 ? previousTotals.dials / daysInPreviousRange : 0
  const prevAvgConnectsPerDay =
    daysInPreviousRange > 0 ? previousTotals.connects / daysInPreviousRange : 0
  const prevAvgConversationsPerDay =
    daysInPreviousRange > 0
      ? previousTotals.conversations / daysInPreviousRange
      : 0
  const prevAvgQualifiedConversationsPerDay =
    daysInPreviousRange > 0
      ? previousTotals.qualifiedConversations / daysInPreviousRange
      : 0
  const prevAvgMeetingsSetPerDay =
    daysInPreviousRange > 0
      ? previousTotals.meetingsSet / daysInPreviousRange
      : 0

  const calcPercentageDiff = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  const dialsDiff = calcPercentageDiff(avgDialsPerDay, prevAvgDialsPerDay)
  const connectsDiff = calcPercentageDiff(
    avgConnectsPerDay,
    prevAvgConnectsPerDay
  )
  const conversationsDiff = calcPercentageDiff(
    avgConversationsPerDay,
    prevAvgConversationsPerDay
  )
  const qualifiedConversationsDiff = calcPercentageDiff(
    avgQualifiedConversationsPerDay,
    prevAvgQualifiedConversationsPerDay
  )
  const meetingsSetDiff = calcPercentageDiff(
    avgMeetingsSetPerDay,
    prevAvgMeetingsSetPerDay
  )

  const responseRate =
    totals.dials > 0
      ? ((totals.conversations / totals.dials) * 100).toFixed(1)
      : "0.0"
  const prevResponseRate =
    previousTotals.dials > 0
      ? ((previousTotals.conversations / previousTotals.dials) * 100).toFixed(1)
      : "0.0"
  const responseRateDiff = calcPercentageDiff(
    parseFloat(responseRate),
    parseFloat(prevResponseRate)
  )

  const bookingRate =
    totals.dials > 0
      ? ((totals.meetingsSet / totals.dials) * 100).toFixed(1)
      : "0.0"
  const prevBookingRate =
    previousTotals.dials > 0
      ? ((previousTotals.meetingsSet / previousTotals.dials) * 100).toFixed(1)
      : "0.0"
  const bookingRateDiff = calcPercentageDiff(
    parseFloat(bookingRate),
    parseFloat(prevBookingRate)
  )

  const closeRate =
    totals.meetingsShowed > 0
      ? ((totals.closedDeals / totals.meetingsShowed) * 100).toFixed(1)
      : "0.0"
  const prevCloseRate =
    previousTotals.meetingsShowed > 0
      ? (
          (previousTotals.closedDeals / previousTotals.meetingsShowed) *
          100
        ).toFixed(1)
      : "0.0"
  const closeRateDiff = calcPercentageDiff(
    parseFloat(closeRate),
    parseFloat(prevCloseRate)
  )

  // Data for Pie Chart
  const pieChartData = [
    { name: "Meetings Showed", value: totals.meetingsShowed },
    { name: "No Shows", value: totals.noShows },
  ]

  const COLORS = ["#4CAF50", "red"] // Green for Showed, Red for No Shows

  // Custom label for pie chart center
  const renderCustomLabel = () => {
    return (
      <text
        x="50%"
        y="36%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="text-2xl font-bold"
      >
        {totals.meetingsScheduled}
      </text>
    )
  }

  return (
    <div className="container mx-auto max-w-full p-4">
      <h1 className="mb-6 text-2xl font-bold">Dialers Analytics</h1>

      <div className="mb-6 flex items-center justify-between">
        <Tabs
          defaultValue={searchParams.get("range") || "30d"}
          onValueChange={handleRangeChange}
        >
          <TabsList>
            <TabsTrigger value="24h">Last 24 Hours</TabsTrigger>
            <TabsTrigger value="7d">Last 7 Days</TabsTrigger>
            <TabsTrigger value="30d">Last 30 Days</TabsTrigger>
            <TabsTrigger value="custom">Custom Range</TabsTrigger>
          </TabsList>
          <TabsContent value="custom">
            <div className="mt-4 flex items-end gap-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="startDate" className="w-20 text-right">
                  Start Date
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-8 w-[200px] justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? (
                        formatInTimeZone(startDate, userTimeZone, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="endDate" className="w-20 text-right">
                  End Date
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-8 w-[200px] justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? (
                        formatInTimeZone(endDate, userTimeZone, "PPP")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                onClick={handleCustomDateSubmit}
                disabled={!startDate || !endDate}
                className="ml-2 h-8"
              >
                Apply
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        <select
          value={selectedDialerId}
          onChange={(e) => handleDialerChange(e.target.value)}
          className="h-8 w-[160px] rounded-md border bg-background p-1 text-sm"
        >
          <option value="">All Dialers</option>
          {dialers.map((dialer) => (
            <option key={dialer.id} value={dialer.id}>
              {dialer.name}
            </option>
          ))}
        </select>
      </div>

      <Table wrapperClassName="max-w-[1000px] overflow-x-auto min-w-[600px]">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Dialer</TableHead>
            <TableHead>Dials</TableHead>
            <TableHead>Connects</TableHead>
            <TableHead>Conversations</TableHead>
            <TableHead>Qualified Conv.</TableHead>
            <TableHead>Meetings Scheduled</TableHead>
            <TableHead>Meetings Set</TableHead>
            <TableHead>Meetings Showed</TableHead>
            <TableHead>No Shows</TableHead>
            <TableHead>Closed Deals</TableHead>
            <TableHead>Revenue ($)</TableHead>
            <TableHead>Cash Collected ($)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dialersMetrics.length ? (
            dialersMetrics.map((metric) => (
              <TableRow key={`${metric.dialerId}-${metric.date}`}>
                <TableCell>
                  {formatInTimeZone(parseISO(metric.date), userTimeZone, "PPP")}
                </TableCell>
                <TableCell>{`${metric.dialer.firstName} ${metric.dialer.lastName}`}</TableCell>
                <TableCell>{metric.dials}</TableCell>
                <TableCell>{metric.connects}</TableCell>
                <TableCell>{metric.conversations}</TableCell>
                <TableCell>{metric.qualifiedConversations}</TableCell>
                <TableCell>{metric.meetingsScheduled}</TableCell>
                <TableCell>{metric.meetingsSet}</TableCell>
                <TableCell>{metric.meetingsShowed}</TableCell>
                <TableCell>{metric.noShows}</TableCell>
                <TableCell>{metric.closedDeals}</TableCell>
                <TableCell>{metric.revenueGenerated.toFixed(2)}</TableCell>
                <TableCell>{metric.cashCollected.toFixed(2)}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={13} className="text-center">
                No metrics found for the selected period or dialer.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <h2 className="mb-4 mt-8 text-xl font-semibold">Metrics</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {/* Daily Averages Tile */}
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Daily Averages
          </h3>
          <div className="space-y-4">
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgDialsPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    dialsDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {dialsDiff >= 0 ? "+" : ""}
                  {dialsDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Dials per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgConnectsPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    connectsDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {connectsDiff >= 0 ? "+" : ""}
                  {connectsDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Connects per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgConversationsPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    conversationsDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {conversationsDiff >= 0 ? "+" : ""}
                  {conversationsDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Conversations per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgQualifiedConversationsPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    qualifiedConversationsDiff >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {qualifiedConversationsDiff >= 0 ? "+" : ""}
                  {qualifiedConversationsDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Qualified Conv. per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgMeetingsSetPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    meetingsSetDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {meetingsSetDiff >= 0 ? "+" : ""}
                  {meetingsSetDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Meetings Set per Day</p>
            </div>
          </div>
        </div>

        {/* Call Metrics Tile */}
        <div className="rounded-lg border bg-background p-4 shadow-sm lg:col-span-2">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Call Metrics
          </h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-400 text-gray-800"
                style={{ width: `${dialsWidth}%` }}
              >
                <span className="text-2xl font-bold">{totals.dials}</span>
                <span className="truncate text-sm">Dials</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-300 text-gray-800"
                style={{ width: `${connectsWidth}%` }}
              >
                <span className="text-2xl font-bold">{totals.connects}</span>
                <span className="truncate text-sm">Connects</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-200 text-gray-800"
                style={{ width: `${conversationsWidth}%` }}
              >
                <span className="text-2xl font-bold">
                  {totals.conversations}
                </span>
                <span className="truncate text-sm">Conversations</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-100 text-gray-800"
                style={{ width: `${qualifiedConversationsWidth}%` }}
              >
                <span className="text-2xl font-bold">
                  {totals.qualifiedConversations}
                </span>
                <span className="truncate text-sm">Qualified Conv.</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-50 text-gray-800"
                style={{ width: `${meetingsSetWidth}%` }}
              >
                <span className="text-2xl font-bold">{totals.meetingsSet}</span>
                <span className="truncate text-sm">Meetings Set</span>
              </div>
            </div>
          </div>
        </div>

        {/* Conversions Tile */}
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Conversions
          </h3>
          <div className="space-y-4">
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {responseRate}%
                </p>
                <p
                  className={`absolute left-2/3 top-1/2 -translate-y-2/3 translate-x-2 text-sm ${
                    responseRateDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {responseRateDiff >= 0 ? "+" : ""}
                  {responseRateDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Response Rate</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">{bookingRate}%</p>
                <p
                  className={`absolute left-2/3 top-1/2 -translate-y-2/3 translate-x-2 text-sm ${
                    bookingRateDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {bookingRateDiff >= 0 ? "+" : ""}
                  {bookingRateDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Booking Rate</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">{closeRate}%</p>
                <p
                  className={`absolute left-2/3 top-1/2 -translate-y-2/3 translate-x-2 text-sm ${
                    closeRateDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {closeRateDiff >= 0 ? "+" : ""}
                  {closeRateDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Close Rate</p>
            </div>
          </div>
        </div>

        {/* Pie Chart Tile for Meetings Showed and No Shows */}
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Meetings Scheduled
          </h3>
          {totals.meetingsShowed + totals.noShows > 0 ? (
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={20}
                  outerRadius={40}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  verticalAlign="bottom"
                  height={40}
                  formatter={(value) => (
                    <span className="text-xs">{value}</span>
                  )}
                />
                {renderCustomLabel()}
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              No meeting data available
            </p>
          )}
        </div>

        {/* Remaining Individual Metric Tiles */}
        {[
          { label: "Closed Deals", value: totals.closedDeals },
          { label: "Revenue ($)", value: totals.revenueGenerated.toFixed(2) },
          {
            label: "Cash Collected ($)",
            value: totals.cashCollected.toFixed(2),
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="flex h-full flex-col items-center justify-center rounded-lg border bg-background p-4 shadow-sm"
          >
            <p className="text-center text-2xl font-bold">{metric.value}</p>
            <h3 className="text-center text-sm font-medium text-muted-foreground">
              {metric.label}
            </h3>
          </div>
        ))}
      </div>
    </div>
  )
}
