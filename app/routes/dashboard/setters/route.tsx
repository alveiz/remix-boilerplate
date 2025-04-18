import { useEffect, useMemo, useState } from "react"
import { json, LoaderFunction } from "@remix-run/node"
import { useLoaderData, useSearchParams } from "@remix-run/react"
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
} from "chart.js"
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
import { Line, Pie } from "react-chartjs-2"

import "chart.js/auto"

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

// Register Chart.js components
ChartJS.register(
  ArcElement,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend
)

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

  // Calculate percentage difference
  const calcPercentageDiff = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  // Sanitize numeric values
  const safeNumber = (value: any): number =>
    typeof value === "number" && !isNaN(value) ? value : 0

  const avgDailyOutboundConversations =
    daysInRange > 0
      ? Math.round(totals.dailyOutboundConversations / daysInRange)
      : 0
  const avgInboundConversations =
    daysInRange > 0 ? Math.round(totals.inboundConversations / daysInRange) : 0
  const avgFollowUps =
    daysInRange > 0 ? Math.round(totals.followUps / daysInRange) : 0
  const avgCallsProposed =
    daysInRange > 0 ? Math.round(totals.callsProposed / daysInRange) : 0
  const avgHighTicketCallsBooked =
    daysInRange > 0
      ? Math.round(totals.totalHighTicketSalesCallsBooked / daysInRange)
      : 0

  const prevAvgDailyOutboundConversations =
    daysInPreviousRange > 0
      ? previousTotals.dailyOutboundConversations / daysInPreviousRange
      : 0
  const prevAvgInboundConversations =
    daysInPreviousRange > 0
      ? previousTotals.inboundConversations / daysInPreviousRange
      : 0
  const prevAvgFollowUps =
    daysInPreviousRange > 0 ? previousTotals.followUps / daysInPreviousRange : 0
  const prevAvgCallsProposed =
    daysInPreviousRange > 0
      ? previousTotals.callsProposed / daysInPreviousRange
      : 0
  const prevAvgHighTicketCallsBooked =
    daysInPreviousRange > 0
      ? previousTotals.totalHighTicketSalesCallsBooked / daysInPreviousRange
      : 0

  const dailyOutboundConversationsDiff = calcPercentageDiff(
    avgDailyOutboundConversations,
    prevAvgDailyOutboundConversations
  )
  const inboundConversationsDiff = calcPercentageDiff(
    avgInboundConversations,
    prevAvgInboundConversations
  )
  const followUpsDiff = calcPercentageDiff(avgFollowUps, prevAvgFollowUps)
  const callsProposedDiff = calcPercentageDiff(
    avgCallsProposed,
    prevAvgCallsProposed
  )
  const highTicketCallsBookedDiff = calcPercentageDiff(
    avgHighTicketCallsBooked,
    prevAvgHighTicketCallsBooked
  )

  const callProposalRate =
    totals.dailyOutboundConversations +
      totals.inboundConversations +
      totals.followUps >
    0
      ? (
          (totals.callsProposed /
            (totals.dailyOutboundConversations +
              totals.inboundConversations +
              totals.followUps)) *
          100
        ).toFixed(1)
      : "0.0"
  const prevCallProposalRate =
    previousTotals.dailyOutboundConversations +
      previousTotals.inboundConversations +
      previousTotals.followUps >
    0
      ? (
          (previousTotals.callsProposed /
            (previousTotals.dailyOutboundConversations +
              previousTotals.inboundConversations +
              previousTotals.followUps)) *
          100
        ).toFixed(1)
      : "0.0"
  const callProposalRateDiff = calcPercentageDiff(
    parseFloat(callProposalRate),
    parseFloat(prevCallProposalRate)
  )

  const highTicketCallBookRate =
    totals.callsProposed > 0
      ? (
          (totals.totalHighTicketSalesCallsBooked / totals.callsProposed) *
          100
        ).toFixed(1)
      : "0.0"
  const prevHighTicketCallBookRate =
    previousTotals.callsProposed > 0
      ? (
          (previousTotals.totalHighTicketSalesCallsBooked /
            previousTotals.callsProposed) *
          100
        ).toFixed(1)
      : "0.0"
  const highTicketCallBookRateDiff = calcPercentageDiff(
    parseFloat(highTicketCallBookRate),
    parseFloat(prevHighTicketCallBookRate)
  )

  const showRate =
    totals.setsScheduled > 0
      ? ((totals.setsTaken / totals.setsScheduled) * 100).toFixed(1)
      : "0.0"
  const prevShowRate =
    previousTotals.setsScheduled > 0
      ? (
          (previousTotals.setsTaken / previousTotals.setsScheduled) *
          100
        ).toFixed(1)
      : "0.0"
  const showRateDiff = calcPercentageDiff(
    parseFloat(showRate),
    parseFloat(prevShowRate)
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

  // Calculate bar widths for Outreach Metrics
  const outreachMaxValue = Math.max(
    totals.dailyOutboundConversations,
    totals.inboundConversations,
    totals.followUps,
    totals.callsProposed,
    totals.totalHighTicketSalesCallsBooked
  )
  const outboundConversationsWidth =
    outreachMaxValue > 0
      ? (totals.dailyOutboundConversations / outreachMaxValue) * 100
      : 0
  const inboundConversationsWidth =
    outreachMaxValue > 0
      ? (totals.inboundConversations / outreachMaxValue) * 100
      : 0
  const followUpsWidth =
    outreachMaxValue > 0 ? (totals.followUps / outreachMaxValue) * 100 : 0
  const callsProposedWidth =
    outreachMaxValue > 0 ? (totals.callsProposed / outreachMaxValue) * 100 : 0
  const highTicketCallsBookedWidth =
    outreachMaxValue > 0
      ? (totals.totalHighTicketSalesCallsBooked / outreachMaxValue) * 100
      : 0

  // Calculate bar widths for Sales Metrics
  const salesMaxValue = Math.max(
    safeNumber(totals.setsScheduled),
    safeNumber(totals.setsTaken),
    safeNumber(totals.closedSets)
  )
  const setsScheduledWidth =
    salesMaxValue > 0
      ? (safeNumber(totals.setsScheduled) / salesMaxValue) * 100
      : 0
  const setsTakenWidth =
    salesMaxValue > 0 ? (safeNumber(totals.setsTaken) / salesMaxValue) * 100 : 0
  const closedSetsWidth =
    salesMaxValue > 0
      ? (safeNumber(totals.closedSets) / salesMaxValue) * 100
      : 0

  // Pie chart data for Revenue Breakdown
  const revenueBreakdownData = {
    labels: ["New Cash", "Recurring Cash", "Downsell Revenue"],
    datasets: [
      {
        data: [
          safeNumber(totals.newCashCollected),
          safeNumber(totals.recurringCashCollected),
          safeNumber(totals.downsellRevenue),
        ],
        backgroundColor: ["#3B82F6", "#22C55E", "#EAB308"], // Tailwind blue-500, green-500, yellow-500
        borderColor: ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
        borderWidth: 1,
      },
    ],
  }

  const pieChartOptions = {
    plugins: {
      legend: {
        position: "bottom" as const,
        align: "start" as const, // Left-align labels
        labels: {
          font: {
            size: 14, // Larger text
          },
          color: "#4B5563", // Tailwind gray-600
          boxWidth: 20, // Shorter color boxes
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.label || ""
            const value = context.raw || 0
            return `${label}: $${value.toFixed(2)}`
          },
        },
      },
    },
    maintainAspectRatio: false,
  }

  // Aggregate daily revenue data for Revenue Over Time chart
  const dailyRevenueData = settersMetrics.reduce(
    (acc, metric) => {
      const date = format(parseISO(metric.date), "yyyy-MM-dd")
      if (!acc[date]) {
        acc[date] = {
          revenueGenerated: 0,
          newCashCollected: 0,
          recurringCashCollected: 0,
          downsellRevenue: 0,
        }
      }
      acc[date].revenueGenerated += safeNumber(metric.revenueGenerated)
      acc[date].newCashCollected += safeNumber(metric.newCashCollected)
      acc[date].recurringCashCollected += safeNumber(
        metric.recurringCashCollected
      )
      acc[date].downsellRevenue += safeNumber(metric.downsellRevenue)
      return acc
    },
    {} as Record<
      string,
      {
        revenueGenerated: number
        newCashCollected: number
        recurringCashCollected: number
        downsellRevenue: number
      }
    >
  )

  const sortedDates = Object.keys(dailyRevenueData).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  )
  const revenueOverTimeData = {
    labels: sortedDates.map((date) => format(parseISO(date), "MMM dd")),
    datasets: [
      {
        label: "Overall Revenue",
        data: sortedDates.map(
          (date) => dailyRevenueData[date].revenueGenerated
        ),
        borderColor: "#3B82F6", // blue-500
        backgroundColor: "rgba(59, 130, 246, 0.2)", // blue-500 with opacity for fill
        fill: true, // Enable area fill under the line
        tension: 0.1,
      },
      {
        label: "New Cash",
        data: sortedDates.map(
          (date) => dailyRevenueData[date].newCashCollected
        ),
        borderColor: "#22C55E", // green-500
        backgroundColor: "#22C55E",
        fill: false, // Keep as line
        tension: 0.1,
      },
      {
        label: "Recurring Cash",
        data: sortedDates.map(
          (date) => dailyRevenueData[date].recurringCashCollected
        ),
        borderColor: "#EAB308", // yellow-500
        backgroundColor: "#EAB308",
        fill: false, // Keep as line
        tension: 0.1,
      },
      {
        label: "Downsell Revenue",
        data: sortedDates.map((date) => dailyRevenueData[date].downsellRevenue),
        borderColor: "#EF4444", // red-500
        backgroundColor: "#EF4444",
        fill: false, // Keep as line
        tension: 0.1,
      },
    ],
  }

  const lineChartOptions = {
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          font: {
            size: 12,
          },
          color: "#4B5563", // gray-600
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.dataset.label || ""
            const value = context.raw || 0
            return `${label}: $${value.toFixed(2)}`
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#4B5563",
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: "#4B5563",
          callback: (value: number) => `$${value.toFixed(0)}`,
        },
      },
    },
    maintainAspectRatio: false,
  }

  // Generate unique key for chart remounting
  const chartKey = JSON.stringify({
    range: searchParams.get("range"),
    setterId: searchParams.get("setterId"),
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
  })

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
        <Table wrapperClassName="max-w-[1080px] overflow-x-auto min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Setter</TableHead>
              <TableHead>New Outbound Conv.</TableHead>
              <TableHead>New Inbound Conv.</TableHead>
              <TableHead>Follow-Ups</TableHead>
              <TableHead>Calls Proposed</TableHead>
              <TableHead>High-Ticket Calls Booked</TableHead>
              <TableHead>Sets Scheduled</TableHead>
              <TableHead>Sets Taken</TableHead>
              <TableHead>Closed Sets</TableHead>
              <TableHead>Revenue ($)</TableHead>
              <TableHead>New Cash ($)</TableHead>
              <TableHead>Recurring Cash ($)</TableHead>
              <TableHead>Downsell Revenue ($)</TableHead>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {/* Daily Averages Tile */}
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Daily Averages
          </h3>
          <div className="space-y-4">
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgDailyOutboundConversations}
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
              <p className="text-center text-sm">New Outbound Conv. per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgInboundConversations}
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
              <p className="text-center text-sm">New Inbound Conv. per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">{avgFollowUps}</p>
                <p
                  className={`absolute left-1/2 top-1/2 -translate-y-2/3 translate-x-3.5 text-sm ${
                    followUpsDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {followUpsDiff >= 0 ? "+" : ""}
                  {followUpsDiff}%
                </p>
              </div>
              <p className="text-center text-sm">Follow-Ups per Day</p>
            </div>
            <div>
              <div className="relative">
                <p className="text-center text-2xl font-bold">
                  {avgCallsProposed}
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
                  {avgHighTicketCallsBooked}
                </p>
                <p
                  className={`-translate-2/3 absolute left-1/2 top-1/2 translate-x-3.5 text-sm ${
                    highTicketCallsBookedDiff >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {highTicketCallsBookedDiff >= 0 ? "+" : ""}
                  {highTicketCallsBookedDiff}%
                </p>
              </div>
              <p className="text-center text-sm">High-Ticket Calls per Day</p>
            </div>
          </div>
        </div>

        {/* Outreach Metrics Tile */}
        <div className="rounded-lg border bg-background p-4 shadow-sm lg:col-span-3">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Outreach Metrics
          </h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="space-y-4 lg:col-span-3">
              <div className="flex items-center">
                <div
                  className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-400 text-gray-800"
                  style={{ width: `${outboundConversationsWidth}%` }}
                >
                  <span className="text-2xl font-bold">
                    {totals.dailyOutboundConversations}
                  </span>
                  <span className="truncate text-sm">New Outbound Conv.</span>
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
                  <span className="truncate text-sm">New Inbound Conv.</span>
                </div>
              </div>
              <div className="flex items-center">
                <div
                  className="flex h-14 min-w-[100px] flex-col items-center justify-center rounded bg-blue-200 text-gray-800"
                  style={{ width: `${followUpsWidth}%` }}
                >
                  <span className="text-2xl font-bold">{totals.followUps}</span>
                  <span className="truncate text-sm">Follow-Ups</span>
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
                  style={{ width: `${highTicketCallsBookedWidth}%` }}
                >
                  <span className="text-2xl font-bold">
                    {totals.totalHighTicketSalesCallsBooked}
                  </span>
                  <span className="truncate text-sm">High-Ticket Calls</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-center">
                <div className="flex min-w-[88px] flex-col items-center">
                  <p className="text-2xl font-bold">{callProposalRate}%</p>
                  <p className="text-center text-sm">Call Proposal Rate</p>
                </div>
                <p
                  className={`text-sm ${
                    callProposalRateDiff >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {callProposalRateDiff >= 0 ? "+" : ""}
                  {callProposalRateDiff}%
                </p>
              </div>
              <div className="flex items-start justify-center">
                <div className="flex min-w-[88px] flex-col items-center">
                  <p className="text-2xl font-bold">
                    {highTicketCallBookRate}%
                  </p>
                  <p className="text-center text-sm">High-Ticket Book Rate</p>
                </div>
                <p
                  className={`text-sm ${
                    highTicketCallBookRateDiff >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {highTicketCallBookRateDiff >= 0 ? "+" : ""}
                  {highTicketCallBookRateDiff}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue Tile */}
        <div className="flex h-full flex-col items-center justify-center rounded-lg border bg-background p-4 shadow-sm">
          <p className="text-center text-2xl font-bold">
            {totals.revenueGenerated.toFixed(2)}
          </p>
          <h3 className="text-center text-sm font-medium text-muted-foreground">
            Revenue ($)
          </h3>
        </div>

        {/* Revenue Breakdown Pie Chart Tile */}
        <div className="flex flex-col rounded-lg border bg-background p-4 shadow-sm">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Revenue Sources
          </h3>
          {totals.newCashCollected +
            totals.recurringCashCollected +
            totals.downsellRevenue ===
          0 ? (
            <p className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
              No revenue data
            </p>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-48 w-full max-w-xs">
                <Pie
                  key={`pie-${chartKey}`}
                  data={revenueBreakdownData}
                  options={pieChartOptions}
                />
              </div>
            </div>
          )}
        </div>

        {/* Sales Metrics Tile */}
        <div className="rounded-lg border bg-background p-4 shadow-sm lg:col-span-3">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Sets Metrics
          </h3>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            {salesMaxValue === 0 ? (
              <div className="text-center text-sm text-muted-foreground lg:col-span-3">
                No sales data available
              </div>
            ) : (
              <div className="space-y-4 lg:col-span-3">
                <div className="flex items-center">
                  <div
                    className="flex h-14 min-w-[100px] max-w-full flex-col items-center justify-center overflow-visible rounded bg-green-400 text-gray-800"
                    style={{ width: `${setsScheduledWidth}%` }}
                  >
                    <span className="text-2xl font-bold">
                      {totals.setsScheduled}
                    </span>
                    <span className="truncate text-sm">Sets Scheduled</span>
                  </div>
                </div>
                <div className="flex items-center">
                  <div
                    className="flex h-14 min-w-[100px] max-w-full flex-col items-center justify-center overflow-visible rounded bg-green-300 text-gray-800"
                    style={{ width: `${setsTakenWidth}%` }}
                  >
                    <span className="text-2xl font-bold">
                      {totals.setsTaken}
                    </span>
                    <span className="truncate text-sm">Sets Taken</span>
                  </div>
                </div>
                <div className="flex items-center">
                  <div
                    className="flex h-14 min-w-[100px] max-w-full flex-col items-center justify-center overflow-visible rounded bg-green-200 text-gray-800"
                    style={{ width: `${closedSetsWidth}%` }}
                  >
                    <span className="text-2xl font-bold">
                      {totals.closedSets}
                    </span>
                    <span className="truncate text-sm">Sets Closed</span>
                  </div>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-center">
                <div className="flex min-w-[88px] flex-col items-center">
                  <p className="text-2xl font-bold">{showRate}%</p>
                  <p className="text-center text-sm">Show Rate</p>
                </div>
                <p
                  className={`text-sm ${
                    showRateDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {showRateDiff >= 0 ? "+" : ""}
                  {showRateDiff}%
                </p>
              </div>
              <div className="flex items-start justify-center">
                <div className="flex min-w-[88px] flex-col items-center">
                  <p className="text-2xl font-bold">{closeRate}%</p>
                  <p className="text-center text-sm">Close Rate</p>
                </div>
                <p
                  className={`text-sm ${
                    closeRateDiff >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {closeRateDiff >= 0 ? "+" : ""}
                  {closeRateDiff}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue Over Time Tile */}
        <div className="rounded-lg border bg-background p-4 shadow-sm lg:col-span-3">
          <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">
            Revenue Over Time
          </h3>
          {searchParams.get("range") === "24h" || daysInRange <= 1 ? (
            <p className="text-center text-sm text-muted-foreground">
              Select a range greater than 24 hours
            </p>
          ) : (
            <div className="h-64">
              <Line
                key={`line-${chartKey}`}
                data={revenueOverTimeData}
                options={lineChartOptions}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
