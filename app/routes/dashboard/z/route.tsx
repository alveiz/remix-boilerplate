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

type SetterMetrics = {
  setterId: string
  setter: { firstName: string; lastName: string }
  dailyOutboundConversations: number
  inboundConversations: number
  followUps: number
  callsProposed: number
  totalHighTicketSalesCallsBooked: number
  setsScheduled: number
  setsTaken: number
  closedSets: number
  revenueGenerated: number
  newCashCollected: number
  recurringCashCollected: number
  downsellRevenue: number
  date: string
}

type LoaderData = {
  settersMetrics: SetterMetrics[]
  totals: {
    dailyOutboundConversations: number
    inboundConversations: number
    followUps: number
    callsProposed: number
    totalHighTicketSalesCallsBooked: number
    setsScheduled: number
    setsTaken: number
    closedSets: number
    revenueGenerated: number
    newCashCollected: number
    recurringCashCollected: number
    downsellRevenue: number
  }
  previousTotals: {
    dailyOutboundConversations: number
    inboundConversations: number
    followUps: number
    callsProposed: number
    totalHighTicketSalesCallsBooked: number
    setsScheduled: number
    setsTaken: number
    closedSets: number
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
  const setterId = url.searchParams.get("setterId")
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

  const settersMetricsRaw = await prisma.setterMetrics.findMany({
    where: {
      date: {
        gte: start,
        lte: end,
      },
      ...(setterId && { setterId }),
    },
    include: {
      setter: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: [{ setterId: "asc" }, { date: "desc" }],
  })

  const previousMetricsRaw = await prisma.setterMetrics.findMany({
    where: {
      date: {
        gte: previousStart,
        lte: previousEnd,
      },
      ...(setterId && { setterId }),
    },
  })

  const settersMetrics = settersMetricsRaw.map((metric) => ({
    ...metric,
    date: metric.date.toISOString(),
  }))

  const totals = settersMetrics.reduce(
    (acc, metric) => ({
      dailyOutboundConversations:
        acc.dailyOutboundConversations + metric.dailyOutboundConversations,
      inboundConversations:
        acc.inboundConversations + metric.inboundConversations,
      followUps: acc.followUps + metric.followUps,
      callsProposed: acc.callsProposed + metric.callsProposed,
      totalHighTicketSalesCallsBooked:
        acc.totalHighTicketSalesCallsBooked +
        metric.totalHighTicketSalesCallsBooked,
      setsScheduled: acc.setsScheduled + metric.setsScheduled,
      setsTaken: acc.setsTaken + metric.setsTaken,
      closedSets: acc.closedSets + metric.closedSets,
      revenueGenerated: acc.revenueGenerated + metric.revenueGenerated,
      newCashCollected: acc.newCashCollected + metric.newCashCollected,
      recurringCashCollected:
        acc.recurringCashCollected + metric.recurringCashCollected,
      downsellRevenue: acc.downsellRevenue + metric.downsellRevenue,
    }),
    {
      dailyOutboundConversations: 0,
      inboundConversations: 0,
      followUps: 0,
      callsProposed: 0,
      totalHighTicketSalesCallsBooked: 0,
      setsScheduled: 0,
      setsTaken: 0,
      closedSets: 0,
      revenueGenerated: 0,
      newCashCollected: 0,
      recurringCashCollected: 0,
      downsellRevenue: 0,
    }
  )

  const previousTotals = previousMetricsRaw.reduce(
    (acc, metric) => ({
      dailyOutboundConversations:
        acc.dailyOutboundConversations + metric.dailyOutboundConversations,
      inboundConversations:
        acc.inboundConversations + metric.inboundConversations,
      followUps: acc.followUps + metric.followUps,
      callsProposed: acc.callsProposed + metric.callsProposed,
      totalHighTicketSalesCallsBooked:
        acc.totalHighTicketSalesCallsBooked +
        metric.totalHighTicketSalesCallsBooked,
      setsScheduled: acc.setsScheduled + metric.setsScheduled,
      setsTaken: acc.setsTaken + metric.setsTaken,
      closedSets: acc.closedSets + metric.closedSets,
    }),
    {
      dailyOutboundConversations: 0,
      inboundConversations: 0,
      followUps: 0,
      callsProposed: 0,
      totalHighTicketSalesCallsBooked: 0,
      setsScheduled: 0,
      setsTaken: 0,
      closedSets: 0,
    }
  )

  return json<LoaderData>({
    settersMetrics,
    totals,
    previousTotals,
    daysInRange,
    daysInPreviousRange,
    userTimeZone,
  })
}

export default function SettersAnalytics() {
  const {
    settersMetrics,
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
  const totalRows = settersMetrics.length
  const totalPages = Math.ceil(totalRows / rowsPerPage)
  const startIndex = (currentPage - 1) * rowsPerPage
  const endIndex = startIndex + rowsPerPage
  const paginatedMetrics = settersMetrics.slice(startIndex, endIndex)

  // Handle page change
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  // Get selected setter from search params
  const selectedSetterId = searchParams.get("setterId") || ""

  // Get unique setters for dropdown
  const setters = useMemo(() => {
    const uniqueSetters = Array.from(
      new Map(
        settersMetrics.map((metric) => [
          metric.setterId,
          {
            id: metric.setterId,
            name: `${metric.setter.firstName} ${metric.setter.lastName}`,
          },
        ])
      ).values()
    )
    return uniqueSetters.sort((a, b) => a.name.localeCompare(b.name))
  }, [settersMetrics])

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
    // Reset to page 1 when settersMetrics changes (e.g., new filter applied)
    setCurrentPage(1)
  }, [settersMetrics])

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
          ...(selectedSetterId && { setterId: selectedSetterId }),
        },
        { replace: true }
      )
    }
  }

  const handleSetterChange = (setterId: string) => {
    setSearchParams(
      (prev) => {
        if (setterId) {
          prev.set("setterId", setterId)
        } else {
          prev.delete("setterId")
        }
        return prev
      },
      { replace: true }
    )
  }

  const dailyOutboundConversationsWidth = 100
  const inboundConversationsWidth =
    totals.dailyOutboundConversations > 0
      ? (totals.inboundConversations / totals.dailyOutboundConversations) * 100
      : 0
  const followUpsWidth =
    totals.dailyOutboundConversations > 0
      ? (totals.followUps / totals.dailyOutboundConversations) * 100
      : 0
  const callsProposedWidth =
    totals.dailyOutboundConversations > 0
      ? (totals.callsProposed / totals.dailyOutboundConversations) * 100
      : 0
  const totalHighTicketSalesCallsBookedWidth =
    totals.dailyOutboundConversations > 0
      ? (totals.totalHighTicketSalesCallsBooked /
          totals.dailyOutboundConversations) *
        100
      : 0

  const avgDailyOutboundConversationsPerDay =
    daysInRange > 0
      ? Math.round(totals.dailyOutboundConversations / daysInRange)
      : 0
  const avgInboundConversationsPerDay =
    daysInRange > 0 ? Math.round(totals.inboundConversations / daysInRange) : 0
  const avgFollowUpsPerDay =
    daysInRange > 0 ? Math.round(totals.followUps / daysInRange) : 0
  const avgCallsProposedPerDay =
    daysInRange > 0 ? Math.round(totals.callsProposed / daysInRange) : 0
  const avgTotalHighTicketSalesCallsBookedPerDay =
    daysInRange > 0
      ? Math.round(totals.totalHighTicketSalesCallsBooked / daysInRange)
      : 0

  const prevAvgDailyOutboundConversationsPerDay =
    daysInPreviousRange > 0
      ? previousTotals.dailyOutboundConversations / daysInPreviousRange
      : 0
  const prevAvgInboundConversationsPerDay =
    daysInPreviousRange > 0
      ? previousTotals.inboundConversations / daysInPreviousRange
      : 0
  const prevAvgFollowUpsPerDay =
    daysInPreviousRange > 0 ? previousTotals.followUps / daysInPreviousRange : 0
  const prevAvgCallsProposedPerDay =
    daysInPreviousRange > 0
      ? previousTotals.callsProposed / daysInPreviousRange
      : 0
  const prevAvgTotalHighTicketSalesCallsBookedPerDay =
    daysInPreviousRange > 0
      ? previousTotals.totalHighTicketSalesCallsBooked / daysInPreviousRange
      : 0

  const calcPercentageDiff = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  const dailyOutboundConversationsDiff = calcPercentageDiff(
    avgDailyOutboundConversationsPerDay,
    prevAvgDailyOutboundConversationsPerDay
  )
  const inboundConversationsDiff = calcPercentageDiff(
    avgInboundConversationsPerDay,
    prevAvgInboundConversationsPerDay
  )
  const followUpsDiff = calcPercentageDiff(
    avgFollowUpsPerDay,
    prevAvgFollowUpsPerDay
  )
  const callsProposedDiff = calcPercentageDiff(
    avgCallsProposedPerDay,
    prevAvgCallsProposedPerDay
  )
  const totalHighTicketSalesCallsBookedDiff = calcPercentageDiff(
    avgTotalHighTicketSalesCallsBookedPerDay,
    prevAvgTotalHighTicketSalesCallsBookedPerDay
  )

  const responseRate =
    totals.dailyOutboundConversations > 0
      ? (
          (totals.inboundConversations / totals.dailyOutboundConversations) *
          100
        ).toFixed(1)
      : "0.0"
  const prevResponseRate =
    previousTotals.dailyOutboundConversations > 0
      ? (
          (previousTotals.inboundConversations /
            previousTotals.dailyOutboundConversations) *
          100
        ).toFixed(1)
      : "0.0"
  const responseRateDiff = calcPercentageDiff(
    parseFloat(responseRate),
    parseFloat(prevResponseRate)
  )

  const bookingRate =
    totals.dailyOutboundConversations > 0
      ? (
          (totals.setsScheduled / totals.dailyOutboundConversations) *
          100
        ).toFixed(1)
      : "0.0"
  const prevBookingRate =
    previousTotals.dailyOutboundConversations > 0
      ? (
          (previousTotals.setsScheduled /
            previousTotals.dailyOutboundConversations) *
          100
        ).toFixed(1)
      : "0.0"
  const bookingRateDiff = calcPercentageDiff(
    parseFloat(bookingRate),
    parseFloat(prevBookingRate)
  )

  const closeRate =
    totals.setsTaken > 0
      ? ((totals.closedSets / totals.setsTaken) * 100).toFixed(1)
      : "0.0"
  const prevCloseRate =
    previousTotals.setsTaken > 0
      ? ((previousTotals.closedSets / previousTotals.setsTaken) * 100).toFixed(
          1
        )
      : "0.0"
  const closeRateDiff = calcPercentageDiff(
    parseFloat(closeRate),
    parseFloat(prevCloseRate)
  )

  // Data for Pie Chart
  const pieChartData = [
    { name: "Sets Taken", value: totals.setsTaken },
    { name: "Closed Sets", value: totals.closedSets },
  ]

  const COLORS = ["#4CAF50", "#2196F3"] // Green for Sets Taken, Blue for Closed Sets

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
        {totals.setsScheduled}
      </text>
    )
  }

  return (
    <div className="container mx-auto max-w-full p-4">
      <h1 className="mb-6 text-2xl font-bold">Setters Analytics</h1>

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
          value={selectedSetterId}
          onChange={(e) => handleSetterChange(e.target.value)}
          className="h-8 w-[160px] rounded-md border bg-background p-1 text-sm"
        >
          <option value="">All Setters</option>
          {setters.map((setter) => (
            <option key={setter.id} value={setter.id}>
              {setter.name}
            </option>
          ))}
        </select>
      </div>

      <div className="relative">
        <Table wrapperClassName="max-w-[1000px] overflow-x-auto min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Setter</TableHead>
              <TableHead>Outbound Conv.</TableHead>
              <TableHead>Inbound Conv.</TableHead>
              <TableHead>Follow Ups</TableHead>
              <TableHead>Calls Proposed</TableHead>
              <TableHead>High Ticket Calls</TableHead>
              <TableHead>Sets Scheduled</TableHead>
              <TableHead>Sets Taken</TableHead>
              <TableHead>Closed Sets</TableHead>
              <TableHead>Revenue ($)</TableHead>
              <TableHead>New Cash ($)</TableHead>
              <TableHead>Recurring Cash ($)</TableHead>
              <TableHead>Downsell Rev. ($)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedMetrics.length ? (
              paginatedMetrics.map((metric) => (
                <TableRow key={`${metric.setterId}-${metric.date}`}>
                  <TableCell>
                    {formatInTimeZone(
                      parseISO(metric.date),
                      userTimeZone,
                      "PPP"
                    )}
                  </TableCell>
                  <TableCell>{`${metric.setter.firstName} ${metric.setter.lastName}`}</TableCell>
                  <TableCell>{metric.dailyOutboundConversations}</TableCell>
                  <TableCell>{metric.inboundConversations}</TableCell>
                  <TableCell>{metric.followUps}</TableCell>
                  <TableCell>{metric.callsProposed}</TableCell>
                  <TableCell>
                    {metric.totalHighTicketSalesCallsBooked}
                  </TableCell>
                  <TableCell>{metric.setsScheduled}</TableCell>
                  <TableCell>{metric.setsTaken}</TableCell>
                  <TableCell>{metric.closedSets}</TableCell>
                  <TableCell>{metric.revenueGenerated.toFixed(2)}</TableCell>
                  <TableCell>{metric.newCashCollected.toFixed(2)}</TableCell>
                  <TableCell>
                    {metric.recurringCashCollected.toFixed(2)}
                  </TableCell>
                  <TableCell>{metric.downsellRevenue.toFixed(2)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={14} className="text-center">
                  No metrics found for the selected period or setter.
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
                  onClickanylticspage={page}
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
                  {avgDailyOutboundConversationsPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    dailyOutboundConversationsDiff >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {dailyOutboundConversationsDiff >= 0 ? "+" : ""}
                  {dailyOutboundConversationsDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Outbound Conv. per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgInboundConversationsPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    inboundConversationsDiff >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {inboundConversationsDiff >= 0 ? "+" : ""}
                  {inboundConversationsDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Inbound Conv. per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgFollowUpsPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    followUpsDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {followUpsDiff >= 0 ? "+" : ""}
                  {followUpsDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Follow Ups per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgCallsProposedPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    callsProposedDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {callsProposedDiff >= 0 ? "+" : ""}
                  {callsProposedDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Calls Proposed per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgTotalHighTicketSalesCallsBookedPerDay}
                </p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    totalHighTicketSalesCallsBookedDiff >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {totalHighTicketSalesCallsBookedDiff >= 0 ? "+" : ""}
                  {totalHighTicketSalesCallsBookedDiff}%
                </p>
              </div>
              <p className="text-center text-sm">High Ticket Calls per Day</p>
            </div>
          </div>
        </div>

        {/* Call Metrics Tile */}
        <div className="rounded-lg border bg-background p-4 shadow-sm lg:col-span-2">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Activity Metrics
          </h3>
          <div className="space-y-4">
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-400 text-gray-800"
                style={{ width: `${dailyOutboundConversationsWidth}%` }}
              >
                <span className="text-2xl font-bold">
                  {totals.dailyOutboundConversations}
                </span>
                <span className="truncate text-sm">Outbound Conv.</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-300 text-gray-800"
                style={{ width: `${inboundConversationsWidth}%` }}
              >
                <span className="text-2xl font-bold">
                  {totals.inboundConversations}
                </span>
                <span className="truncate text-sm">Inbound Conv.</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-200 text-gray-800"
                style={{ width: `${followUpsWidth}%` }}
              >
                <span className="text-2xl font-bold">{totals.followUps}</span>
                <span className="truncate text-sm">Follow Ups</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-100 text-gray-800"
                style={{ width: `${callsProposedWidth}%` }}
              >
                <span className="text-2xl font-bold">
                  {totals.callsProposed}
                </span>
                <span className="truncate text-sm">Calls Proposed</span>
              </div>
            </div>
            <div className="flex items-center">
              <div
                className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-50 text-gray-800"
                style={{ width: `${totalHighTicketSalesCallsBookedWidth}%` }}
              >
                <span className="text-2xl font-bold">
                  {totals.totalHighTicketSalesCallsBooked}
                </span>
                <span className="truncate text-sm">High Ticket Calls</span>
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

        {/* Pie Chart Tile for Sets Taken and Closed Sets */}
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Sets Scheduled
          </h3>
          {totals.setsTaken + totals.closedSets > 0 ? (
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
              No set data available
            </p>
          )}
        </div>

        {/* Individual Metric Tiles */}
        {[
          { label: "Revenue ($)", value: totals.revenueGenerated.toFixed(2) },
          { label: "New Cash ($)", value: totals.newCashCollected.toFixed(2) },
          {
            label: "Recurring Cash ($)",
            value: totals.recurringCashCollected.toFixed(2),
          },
          {
            label: "Downsell Rev. ($)",
            value: totals.downsellRevenue.toFixed(2),
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
