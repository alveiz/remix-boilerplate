import { useState } from "react"
import { json, LoaderFunction } from "@remix-run/node"
import { useLoaderData, useSearchParams } from "@remix-run/react"
import { format, isValid, parseISO, subDays } from "date-fns"
import { CalendarIcon } from "lucide-react"

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
  averages: {
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
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url)
  const range = url.searchParams.get("range") || "30d"
  const startDate = url.searchParams.get("startDate")
  const endDate = url.searchParams.get("endDate")

  let start: Date
  let end = new Date()

  if (range === "custom" && startDate && endDate) {
    const parsedStart = parseISO(startDate)
    const parsedEnd = parseISO(endDate)
    if (isValid(parsedStart) && isValid(parsedEnd)) {
      start = parsedStart
      end = parsedEnd
    } else {
      start = subDays(end, 30) // Fallback to 30 days
    }
  } else if (range === "24h") {
    start = subDays(end, 1)
  } else if (range === "7d") {
    start = subDays(end, 7)
  } else {
    start = subDays(end, 30) // Default: 30 days
  }

  const dialersMetricsRaw = await prisma.dialerMetrics.findMany({
    where: {
      date: {
        gte: start,
        lte: end,
      },
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

  const dialersMetrics = dialersMetricsRaw.map((metric) => ({
    ...metric,
    date: metric.date.toISOString(),
  }))

  const totalDialers = dialersMetrics.length || 1
  const averages = dialersMetrics.reduce(
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

  const averagedMetrics = {
    dials: Number((averages.dials / totalDialers).toFixed(1)),
    connects: Number((averages.connects / totalDialers).toFixed(1)),
    conversations: Number((averages.conversations / totalDialers).toFixed(1)),
    qualifiedConversations: Number(
      (averages.qualifiedConversations / totalDialers).toFixed(1)
    ),
    meetingsScheduled: Number(
      (averages.meetingsScheduled / totalDialers).toFixed(1)
    ),
    meetingsSet: Number((averages.meetingsSet / totalDialers).toFixed(1)),
    meetingsShowed: Number((averages.meetingsShowed / totalDialers).toFixed(1)),
    noShows: Number((averages.noShows / totalDialers).toFixed(1)),
    closedDeals: Number((averages.closedDeals / totalDialers).toFixed(1)),
    revenueGenerated: Number(
      (averages.revenueGenerated / totalDialers).toFixed(2)
    ),
    cashCollected: Number((averages.cashCollected / totalDialers).toFixed(2)),
  }

  return json<LoaderData>({ dialersMetrics, averages: averagedMetrics })
}

export default function DialersAnalytics() {
  const { dialersMetrics, averages } = useLoaderData<LoaderData>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()

  const handleRangeChange = (range: string) => {
    if (range === "custom") {
      setSearchParams({ range })
    } else {
      setSearchParams({ range })
      setStartDate(undefined)
      setEndDate(undefined)
    }
  }

  const handleCustomDateSubmit = () => {
    if (startDate && endDate) {
      setSearchParams({
        range: "custom",
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      })
    }
  }

  return (
    <div className="container mx-auto max-w-full p-4">
      <h1 className="mb-6 text-2xl font-bold">Dialers Analytics</h1>

      {/* Time Range Filters */}
      <Tabs
        defaultValue={searchParams.get("range") || "30d"}
        onValueChange={handleRangeChange}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="24h">Last 24 Hours</TabsTrigger>
          <TabsTrigger value="7d">Last 7 Days</TabsTrigger>
          <TabsTrigger value="30d">Last 30 Days</TabsTrigger>
          <TabsTrigger value="custom">Custom Range</TabsTrigger>
        </TabsList>
        <TabsContent value="custom">
          <div className="mt-4 flex items-end gap-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[240px] justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? (
                      format(startDate, "PPP")
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
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[240px] justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? (
                      format(endDate, "PPP")
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
            >
              Apply
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Metrics Table */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full align-middle">
          <Table className="min-w-[1000px]">
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
                      {format(parseISO(metric.date), "PPP")}
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
                    No metrics found for the selected period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Average Metrics Tiles */}
      <h2 className="mb-4 mt-8 text-xl font-semibold">Average Metrics</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {[
          { label: "Dials", value: averages.dials },
          { label: "Connects", value: averages.connects },
          { label: "Conversations", value: averages.conversations },
          { label: "Qualified Conv.", value: averages.qualifiedConversations },
          { label: "Meetings Scheduled", value: averages.meetingsScheduled },
          { label: "Meetings Set", value: averages.meetingsSet },
          { label: "Meetings Showed", value: averages.meetingsShowed },
          { label: "No Shows", value: averages.noShows },
          { label: "Closed Deals", value: averages.closedDeals },
          { label: "Revenue ($)", value: averages.revenueGenerated.toFixed(2) },
          {
            label: "Cash Collected ($)",
            value: averages.cashCollected.toFixed(2),
          },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border bg-background p-4 shadow-sm"
          >
            <h3 className="text-sm font-medium text-muted-foreground">
              {metric.label}
            </h3>
            <p className="text-2xl font-bold">{metric.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
