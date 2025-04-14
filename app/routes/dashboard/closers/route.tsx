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

type CloserMetrics = {
  closerId: string
  closer: { firstName: string; lastName: string }
  dailyCallsBooked: number
  shows: number
  noShows: number
  cancelled: number
  disqualified: number
  rescheduled: number
  offersMade: number
  callsTaken: number
  closes: number
  cashCollected: number
  revenueGenerated: number
  date: string
}

type LoaderData = {
  closersMetrics: CloserMetrics[]
  totals: {
    dailyCallsBooked: number
    shows: number
    noShows: number
    cancelled: number
    disqualified: number
    rescheduled: number
    offersMade: number
    callsTaken: number
    closes: number
    cashCollected: number
    revenueGenerated: number
  }
  previousTotals: {
    dailyCallsBooked: number
    shows: number
    noShows: number
    cancelled: number
    disqualified: number
    rescheduled: number
    offersMade: number
    callsTaken: number
    closes: number
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
  const closerId = url.searchParams.get("closerId")
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

  const closersMetricsRaw = await prisma.closerMetrics.findMany({
    where: {
      date: {
        gte: start,
        lte: end,
      },
      ...(closerId && { closerId }),
    },
    include: {
      closer: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: [{ closerId: "asc" }, { date: "desc" }],
  })

  const previousMetricsRaw = await prisma.closerMetrics.findMany({
    where: {
      date: {
        gte: previousStart,
        lte: previousEnd,
      },
      ...(closerId && { closerId }),
    },
  })

  const closersMetrics = closersMetricsRaw.map((metric) => ({
    ...metric,
    date: metric.date.toISOString(),
  }))

  const totals = closersMetrics.reduce(
    (acc, metric) => ({
      dailyCallsBooked: acc.dailyCallsBooked + metric.dailyCallsBooked,
      shows: acc.shows + metric.shows,
      noShows: acc.noShows + metric.noShows,
      cancelled: acc.cancelled + metric.cancelled,
      disqualified: acc.disqualified + metric.disqualified,
      rescheduled: acc.rescheduled + metric.rescheduled,
      offersMade: acc.offersMade + metric.offersMade,
      callsTaken: acc.callsTaken + metric.callsTaken,
      closes: acc.closes + metric.closes,
      cashCollected: acc.cashCollected + metric.cashCollected,
      revenueGenerated: acc.revenueGenerated + metric.revenueGenerated,
    }),
    {
      dailyCallsBooked: 0,
      shows: 0,
      noShows: 0,
      cancelled: 0,
      disqualified: 0,
      rescheduled: 0,
      offersMade: 0,
      callsTaken: 0,
      closes: 0,
      cashCollected: 0,
      revenueGenerated: 0,
    }
  )

  const previousTotals = previousMetricsRaw.reduce(
    (acc, metric) => ({
      dailyCallsBooked: acc.dailyCallsBooked + metric.dailyCallsBooked,
      shows: acc.shows + metric.shows,
      noShows: acc.noShows + metric.noShows,
      cancelled: acc.cancelled + metric.cancelled,
      disqualified: acc.disqualified + metric.disqualified,
      rescheduled: acc.rescheduled + metric.rescheduled,
      offersMade: acc.offersMade + metric.offersMade,
      callsTaken: acc.callsTaken + metric.callsTaken,
      closes: acc.closes + metric.closes,
    }),
    {
      dailyCallsBooked: 0,
      shows: 0,
      noShows: 0,
      cancelled: 0,
      disqualified: 0,
      rescheduled: 0,
      offersMade: 0,
      callsTaken: 0,
      closes: 0,
    }
  )

  return json<LoaderData>({
    closersMetrics,
    totals,
    previousTotals,
    daysInRange,
    daysInPreviousRange,
    userTimeZone,
  })
}

export default function ClosersAnalytics() {
  const {
    closersMetrics,
    totals,
    previousTotals,
    daysInRange,
    daysInPreviousRange,
    userTimeZone,
  } = useLoaderData<LoaderData>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()
  const [currentPage, setCurrentPage] = useState(1)

  // Pagination settings
  const rowsPerPage = 10
  const totalRows = closersMetrics.length
  const totalPages = Math.ceil(totalRows / rowsPerPage)
  const startIndex = (currentPage - 1) * rowsPerPage
  const endIndex = startIndex + rowsPerPage
  const paginatedMetrics = closersMetrics.slice(startIndex, endIndex)

  // Handle page change
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  // Get selected closer from search params
  const selectedCloserId = searchParams.get("closerId") || ""

  // Get unique closers for dropdown
  const closers = useMemo(() => {
    const uniqueClosers = Array.from(
      new Map(
        closersMetrics.map((metric) => [
          metric.closerId,
          {
            id: metric.closerId,
            name: `${metric.closer.firstName} ${metric.closer.lastName}`,
          },
        ])
      ).values()
    )
    return uniqueClosers.sort((a, b) => a.name.localeCompare(b.name))
  }, [closersMetrics])

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

  useEffect(() => {
    // Reset to page 1 when closersMetrics changes (e.g., new filter applied)
    setCurrentPage(1)
  }, [closersMetrics])

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
          ...(selectedCloserId && { closerId: selectedCloserId }),
        },
        { replace: true }
      )
    }
  }

  const handleCloserChange = (closerId: string) => {
    setSearchParams(
      (prev) => {
        if (closerId) {
          prev.set("closerId", closerId)
        } else {
          prev.delete("closerId")
        }
        return prev
      },
      { replace: true }
    )
  }

  const dailyCallsBookedWidth = 100
  const showsWidth =
    totals.dailyCallsBooked > 0
      ? (totals.shows / totals.dailyCallsBooked) * 100
      : 0
  const offersMadeWidth =
    totals.dailyCallsBooked > 0
      ? (totals.offersMade / totals.dailyCallsBooked) * 100
      : 0
  const callsTakenWidth =
    totals.dailyCallsBooked > 0
      ? (totals.callsTaken / totals.dailyCallsBooked) * 100
      : 0
  const closesWidth =
    totals.dailyCallsBooked > 0
      ? (totals.closes / totals.dailyCallsBooked) * 100
      : 0

  const avgDailyCallsBookedPerDay =
    daysInRange > 0 ? Math.round(totals.dailyCallsBooked / daysInRange) : 0
  const avgShowsPerDay =
    daysInRange > 0 ? Math.round(totals.shows / daysInRange) : 0
  const avgOffersMadePerDay =
    daysInRange > 0 ? Math.round(totals.offersMade / daysInRange) : 0
  const avgCallsTakenPerDay =
    daysInRange > 0 ? Math.round(totals.callsTaken / daysInRange) : 0
  const avgClosesPerDay =
    daysInRange > 0 ? Math.round(totals.closes / daysInRange) : 0

  const prevAvgDailyCallsBookedPerDay =
    daysInPreviousRange > 0
      ? previousTotals.dailyCallsBooked / daysInPreviousRange
      : 0
  const prevAvgShowsPerDay =
    daysInPreviousRange > 0 ? previousTotals.shows / daysInPreviousRange : 0
  const prevAvgOffersMadePerDay =
    daysInPreviousRange > 0
      ? previousTotals.offersMade / daysInPreviousRange
      : 0
  const prevAvgCallsTakenPerDay =
    daysInPreviousRange > 0
      ? previousTotals.callsTaken / daysInPreviousRange
      : 0
  const prevAvgClosesPerDay =
    daysInPreviousRange > 0 ? previousTotals.closes / daysInPreviousRange : 0

  const calcPercentageDiff = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  const dailyCallsBookedDiff = calcPercentageDiff(
    avgDailyCallsBookedPerDay,
    prevAvgDailyCallsBookedPerDay
  )
  const showsDiff = calcPercentageDiff(avgShowsPerDay, prevAvgShowsPerDay)
  const offersMadeDiff = calcPercentageDiff(
    avgOffersMadePerDay,
    prevAvgOffersMadePerDay
  )
  const callsTakenDiff = calcPercentageDiff(
    avgCallsTakenPerDay,
    prevAvgCallsTakenPerDay
  )
  const closesDiff = calcPercentageDiff(avgClosesPerDay, prevAvgClosesPerDay)

  const showRate =
    totals.dailyCallsBooked > 0
      ? ((totals.shows / totals.dailyCallsBooked) * 100).toFixed(1)
      : "0.0"
  const prevShowRate =
    previousTotals.dailyCallsBooked > 0
      ? (
          (previousTotals.shows / previousTotals.dailyCallsBooked) *
          100
        ).toFixed(1)
      : "0.0"
  const showRateDiff = calcPercentageDiff(
    parseFloat(showRate),
    parseFloat(prevShowRate)
  )

  const offerRate =
    totals.callsTaken > 0
      ? ((totals.offersMade / totals.callsTaken) * 100).toFixed(1)
      : "0.0"
  const prevOfferRate =
    previousTotals.callsTaken > 0
      ? ((previousTotals.offersMade / previousTotals.callsTaken) * 100).toFixed(
          1
        )
      : "0.0"
  const offerRateDiff = calcPercentageDiff(
    parseFloat(offerRate),
    parseFloat(prevOfferRate)
  )

  const closeRate =
    totals.callsTaken > 0
      ? ((totals.closes / totals.callsTaken) * 100).toFixed(1)
      : "0.0"
  const prevCloseRate =
    previousTotals.callsTaken > 0
      ? ((previousTotals.closes / previousTotals.callsTaken) * 100).toFixed(1)
      : "0.0"
  const closeRateDiff = calcPercentageDiff(
    parseFloat(closeRate),
    parseFloat(prevCloseRate)
  )

  // Data for Pie Chart
  const pieChartData = [
    { name: "Shows", value: totals.shows },
    { name: "Closes", value: totals.closes },
  ]

  const COLORS = ["#4CAF50", "#2196F3"] // Green for Shows, Blue for Closes

  // Custom label for pie chart center
  const renderCustomLabel = () => {
    return (
      <text
        x="50%"
        y="38%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="text-2xl font-bold"
      >
        {totals.callsTaken}
      </text>
    )
  }

  return (
    <div className="container mx-auto max-w-full p-4">
      <h1 className="mb-6 text-2xl font-bold">Closers Analytics</h1>

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
          value={selectedCloserId}
          onChange={(e) => handleCloserChange(e.target.value)}
          className="h-8 w-[160px] rounded-md border bg-background p-1 text-sm"
        >
          <option value="">All Closers</option>
          {closers.map((closer) => (
            <option key={closer.id} value={closer.id}>
              {closer.name}
            </option>
          ))}
        </select>
      </div>

      <div className="relative">
        <Table wrapperClassName="max-w-[1000px] overflow-x-auto min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Closer</TableHead>
              <TableHead>Calls Booked</TableHead>
              <TableHead>Shows</TableHead>
              <TableHead>No Shows</TableHead>
              <TableHead>Cancelled</TableHead>
              <TableHead>Disqualified</TableHead>
              <TableHead>Rescheduled</TableHead>
              <TableHead>Offers Made</TableHead>
              <TableHead>Calls Taken</TableHead>
              <TableHead>Closes</TableHead>
              <TableHead>Cash Collected ($)</TableHead>
              <TableHead>Revenue ($)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedMetrics.length ? (
              paginatedMetrics.map((metric) => (
                <TableRow key={`${metric.closerId}-${metric.date}`}>
                  <TableCell>
                    {formatInTimeZone(
                      parseISO(metric.date),
                      userTimeZone,
                      "PPP"
                    )}
                  </TableCell>
                  <TableCell>{`${metric.closer.firstName} ${metric.closer.lastName}`}</TableCell>
                  <TableCell>{metric.dailyCallsBooked}</TableCell>
                  <TableCell>{metric.shows}</TableCell>
                  <TableCell>{metric.noShows}</TableCell>
                  <TableCell>{metric.cancelled}</TableCell>
                  <TableCell>{metric.disqualified}</TableCell>
                  <TableCell>{metric.rescheduled}</TableCell>
                  <TableCell>{metric.offersMade}</TableCell>
                  <TableCell>{metric.callsTaken}</TableCell>
                  <TableCell>{metric.closes}</TableCell>
                  <TableCell>{metric.cashCollected.toFixed(2)}</TableCell>
                  <TableCell>{metric.revenueGenerated.toFixed(2)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={13} className="text-center">
                  No metrics found for the selected period or closer.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination Controls */}
        {totalRows > rowsPerPage && (
          <div className="mt-4 flex justify-end space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (page) => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(page)}
                >
                  {page}
                </Button>
              )
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>

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
                  {avgDailyCallsBookedPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    dailyCallsBookedDiff >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {dailyCallsBookedDiff >= 0 ? "+" : ""}
                  {dailyCallsBookedDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Calls Booked per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgShowsPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    showsDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {showsDiff >= 0 ? "+" : ""}
                  {showsDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Shows per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgOffersMadePerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    offersMadeDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {offersMadeDiff >= 0 ? "+" : ""}
                  {offersMadeDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Offers Made per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgCallsTakenPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    callsTakenDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {callsTakenDiff >= 0 ? "+" : ""}
                  {callsTakenDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Calls Taken per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgClosesPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    closesDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {closesDiff >= 0 ? "+" : ""}
                  {closesDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Closes per Day</p>
            </div>
          </div>
        </div>

        {/* Activity Metrics Tile */}
        <div className="rounded-lg border bg-background p-4 shadow-sm lg:col-span-2">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Activity Metrics
          </h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-400 text-gray-800"
                style={{ width: `${dailyCallsBookedWidth}%` }}
              >
                <span className="text-2xl font-bold">
                  {totals.dailyCallsBooked}
                </span>
                <span className="truncate text-sm">Calls Booked</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-300 text-gray-800"
                style={{ width: `${showsWidth}%` }}
              >
                <span className="text-2xl font-bold">{totals.shows}</span>
                <span className="truncate text-sm">Shows</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-200 text-gray-800"
                style={{ width: `${offersMadeWidth}%` }}
              >
                <span className="text-2xl font-bold">{totals.offersMade}</span>
                <span className="truncate text-sm">Offers Made</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-100 text-gray-800"
                style={{ width: `${callsTakenWidth}%` }}
              >
                <span className="text-2xl font-bold">{totals.callsTaken}</span>
                <span className="truncate text-sm">Calls Taken</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-50 text-gray-800"
                style={{ width: `${closesWidth}%` }}
              >
                <span className="text-2xl font-bold">{totals.closes}</span>
                <span className="truncate text-sm">Closes</span>
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
                <p className="text-center text-2xl font-bold">{showRate}%</p>
                <p
                  className={`absolute left-2/3 top-1/2 -translate-y-2/3 translate-x-2 text-sm ${
                    showRateDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {showRateDiff >= 0 ? "+" : ""}
                  {showRateDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Show Rate</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">{offerRate}%</p>
                <p
                  className={`absolute left-2/3 top-1/2 -translate-y-2/3 translate-x-2 text-sm ${
                    offerRateDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {offerRateDiff >= 0 ? "+" : ""}
                  {offerRateDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Offer Rate</p>
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

        {/* Pie Chart Tile for Shows and Closes */}
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Calls Taken
          </h3>
          {totals.shows + totals.closes > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
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
              No call data available
            </p>
          )}
        </div>

        {/* Individual Metric Tiles */}
        {[
          {
            label: "Cash Collected ($)",
            value: totals.cashCollected.toFixed(2),
          },
          { label: "Revenue ($)", value: totals.revenueGenerated.toFixed(2) },
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
