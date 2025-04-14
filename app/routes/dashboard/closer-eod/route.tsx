import { useEffect, useRef, useState } from "react"
import { json } from "@remix-run/node"
import type { ActionFunction, LoaderFunction } from "@remix-run/node"
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "@remix-run/react"
import { Info } from "lucide-react"

import { prisma } from "@/services/db/db.server"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type ActionData = {
  errors?: {
    [key: string]: string
  }
  existingDate?: string
  success?: boolean
}

type LoaderData = {
  closer: { id: string; firstName: string; lastName: string }
}

export const loader: LoaderFunction = async ({ request }) => {
  const closerId = "67fc6f96c7394b8e022c058d"
  const closer = await prisma.closer.findUnique({
    where: { id: closerId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  })

  if (!closer) throw new Error("Closer not found")
  return json<LoaderData>({ closer })
}

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData()
  const closerId = "67fc6f96c7394b8e022c058d"
  const date = formData.get("date") as string
  const forceOverwrite = formData.get("forceOverwrite") === "true"

  const metrics = {
    dailyCallsBooked: Number(formData.get("dailyCallsBooked")),
    shows: Number(formData.get("shows")),
    noShows: Number(formData.get("noShows")),
    cancelled: Number(formData.get("cancelled")),
    disqualified: Number(formData.get("disqualified")),
    rescheduled: Number(formData.get("rescheduled")),
    offersMade: Number(formData.get("offersMade")),
    callsTaken: Number(formData.get("callsTaken")),
    closes: Number(formData.get("closes")),
    cashCollected: Number(formData.get("cashCollected")),
    revenueGenerated: Number(formData.get("revenueGenerated")),
  }

  const errors: { [key: string]: string } = {}
  if (!date) errors.date = "Please select a date"
  Object.entries(metrics).forEach(([key, value]) => {
    if (isNaN(value) || value < 0) {
      errors[key] = "Please enter a valid number"
    }
  })

  // Validation rules based on CloserMetrics logic
  if (
    metrics.dailyCallsBooked !=
    metrics.shows +
      metrics.noShows +
      metrics.cancelled +
      metrics.disqualified +
      metrics.rescheduled
  ) {
    errors.dailyCallsBooked =
      "Daily Calls Booked must equal the sum of Shows, No Shows, Cancelled, Disqualified, and Rescheduled"
  } else if (
    metrics.shows >
    metrics.dailyCallsBooked -
      metrics.cancelled -
      metrics.disqualified -
      metrics.rescheduled
  ) {
    errors.shows =
      "Shows cannot exceed Daily Calls Booked minus Cancelled, Disqualified, and Rescheduled"
  } else if (
    metrics.noShows >
    metrics.dailyCallsBooked -
      metrics.shows -
      metrics.cancelled -
      metrics.disqualified -
      metrics.rescheduled
  ) {
    errors.noShows =
      "No Shows cannot exceed Daily Calls Booked minus Shows, Cancelled, Disqualified, and Rescheduled"
  } else if (metrics.dailyCallsBooked == 0 && metrics.shows > 0) {
    errors.shows = "Shows cannot be greater than 0 if Daily Calls Booked is 0"
  } else if (metrics.dailyCallsBooked == 0 && metrics.noShows > 0) {
    errors.noShows =
      "No Shows cannot be greater than 0 if Daily Calls Booked is 0"
  } else if (metrics.cancelled > metrics.dailyCallsBooked) {
    errors.cancelled = "Cancelled cannot exceed Daily Calls Booked"
  } else if (metrics.rescheduled > metrics.dailyCallsBooked) {
    errors.rescheduled = "Rescheduled cannot exceed Daily Calls Booked"
  } else if (metrics.callsTaken > metrics.dailyCallsBooked) {
    errors.callsTaken = "Calls Taken cannot exceed Daily Calls Booked"
  } else if (metrics.offersMade > metrics.callsTaken) {
    errors.offersMade = "Offers Made cannot exceed Calls Taken"
  } else if (metrics.closes > metrics.callsTaken) {
    errors.closes = "Closes cannot exceed Calls Taken"
  } else if (metrics.closes > metrics.offersMade) {
    errors.closes = "Closes cannot exceed Offers Made"
  } else if (metrics.cashCollected > 0 && metrics.closes <= 0) {
    errors.closes = "Closes must be greater than 0 if Cash Collected > 0"
  } else if (metrics.revenueGenerated > 0 && metrics.closes <= 0) {
    errors.closes = "Closes must be greater than 0 if Revenue Generated > 0"
  }

  if (!forceOverwrite) {
    const existingMetric = await prisma.closerMetrics.findUnique({
      where: {
        closerId_date: {
          closerId,
          date: new Date(date),
        },
      },
    })

    if (existingMetric) {
      return json<ActionData>({ existingDate: date }, { status: 409 })
    }
  }

  if (Object.keys(errors).length > 0) {
    return json<ActionData>({ errors }, { status: 400 })
  }

  await prisma.closerMetrics.upsert({
    where: {
      closerId_date: {
        closerId,
        date: new Date(date),
      },
    },
    update: metrics,
    create: {
      ...metrics,
      closerId,
      date: new Date(date),
    },
  })

  return json<ActionData>({ success: true })
}

const fieldInfo = {
  dailyCallsBooked: {
    description:
      "Enter the total number of calls scheduled on your calendar today.",
    include: "All calls booked by SDRs, prospects, or others.",
    why: "Tracks all scheduled opportunities.",
    exclude: "Calls that were never added to your calendar.",
    important:
      "Must equal the sum of Showed, No Showed, Cancelled, Disqualified, and Rescheduled.",
  },
  shows: {
    description: "Enter the total number of booked calls that showed up today.",
    include: "All calls where the prospect attended.",
    why: "Measures attendance rates.",
    exclude: "Calls that were rescheduled, cancelled, or marked as no-show.",
    important:
      "Must not exceed Calls Booked - (Cancelled + Disqualified + Rescheduled).",
  },
  noShows: {
    description:
      "Enter the total number of calls where the prospect did not show up.",
    include: "Scheduled calls with no attendance today.",
    why: "Tracks missed opportunities.",
    exclude: "Attended, cancelled, or rescheduled calls.",
    important: "Must complement Shows to calculate rates.",
  },
  cancelled: {
    description: "Enter the total number of calls cancelled by prospects.",
    include: "Calls officially cancelled and removed from the schedule.",
    why: "Tracks lost opportunities.",
    exclude: "Calls rescheduled or no-showed.",
    important: "Contributes to total Calls Booked distribution.",
  },
  disqualified: {
    description: "Enter the total number of disqualified calls.",
    include: "Calls where prospects didn’t meet qualification criteria.",
    why: "Tracks lead quality.",
    exclude: "Qualified calls, even if they didn’t close.",
    important: "Contributes to total Calls Booked distribution.",
  },
  rescheduled: {
    description: "Enter the total number of calls rescheduled today.",
    include: "Calls officially moved to a different date.",
    why: "Tracks leads that remain in the pipeline.",
    exclude: "Calls cancelled or attended today.",
    important: "Reflects pipeline management.",
  },
  offersMade: {
    description: "Enter the total number of offers presented during calls.",
    include: "Only offers made during today’s calls.",
    why: "Tracks sales activity.",
    exclude: "Offers made outside of today's reported calls.",
    important: "Must not exceed Calls Taken.",
  },
  callsTaken: {
    description: "Enter the total number of calls attended today.",
    include: "All calls handled by you today.",
    why: "Tracks your daily activity.",
    exclude: "Calls not attended or rescheduled.",
    important: "Must not exceed Calls Booked.",
  },
  closes: {
    description:
      "Enter the total number of calls that resulted in a closed sale.",
    include: "All successful calls where deals were finalized.",
    why: "Tracks sales success.",
    exclude: "Leads still in negotiation or pending.",
    important: "Must not exceed Calls Taken nor Offers Made.",
  },
  revenueGenerated: {
    description: "Enter the total revenue generated from closed deals.",
    include: "Full sale value (including deferred revenue).",
    why: "Tracks overall deal value.",
    exclude: "Non-finalized deals or leads still in negotiation.",
    important: "Reflects overall sales performance.",
  },
  cashCollected: {
    description: "Enter the total amount of cash collected from closed deals.",
    include: "All upfront payments received today.",
    why: "Tracks immediate financial impact.",
    exclude: "Deferred or pending payments.",
    important: "Reflects efficiency in cash flow.",
  },
}

export default function ClosersEOD() {
  const { closer } = useLoaderData<LoaderData>()
  const actionData = useActionData<ActionData>()
  const navigation = useNavigation()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [showOverwriteModal, setShowOverwriteModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [forceOverwrite, setForceOverwrite] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (actionData?.existingDate && !forceOverwrite) {
      setShowOverwriteModal(true)
      setShowSuccessModal(false)
    } else if (actionData?.success) {
      setShowSuccessModal(true)
      setShowOverwriteModal(false)
      setForceOverwrite(false)
    }
  }, [actionData])

  const handleOverwriteConfirm = () => {
    setForceOverwrite(true)
    setShowOverwriteModal(false)
    if (formRef.current) {
      // Update forceOverwrite in form data
      const forceOverwriteInput = formRef.current.querySelector(
        'input[name="forceOverwrite"]'
      ) as HTMLInputElement
      if (forceOverwriteInput) {
        forceOverwriteInput.value = "true"
      }
      // Programmatically submit the form
      formRef.current.requestSubmit()
    }
  }

  const handleCancel = () => {
    setShowOverwriteModal(false)
  }

  const handleSuccessConfirm = () => {
    setShowSuccessModal(false)
  }

  return (
    <div className="container mx-auto max-w-4xl p-4">
      <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight">
        Closer EOD Form
      </h2>

      <Form method="post" className="mt-10 space-y-6" ref={formRef}>
        {/* Hidden input for forceOverwrite */}
        <input
          type="hidden"
          name="forceOverwrite"
          value={forceOverwrite ? "true" : "false"}
        />

        {/* Date Selection */}
        <div>
          <Label htmlFor="date">Date</Label>
          <div className="mt-2">
            <Input
              type="date"
              id="date"
              name="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="date-input"
            />
            {actionData?.errors?.date && (
              <p className="mt-2 text-sm text-red-500">
                {actionData.errors.date}
              </p>
            )}
          </div>
        </div>

        {/* Metrics Grid */}
        <TooltipProvider>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[
              { name: "dailyCallsBooked", label: "Calls Booked" },
              { name: "callsTaken", label: "Calls Taken" },
              { name: "shows", label: "Shows" },
              { name: "noShows", label: "No Shows" },
              { name: "cancelled", label: "Cancellations" },
              { name: "disqualified", label: "Disqualifications" },
              { name: "rescheduled", label: "Reschedules" },
              { name: "offersMade", label: "Offers Made" },
              { name: "closes", label: "Closes" },
              { name: "cashCollected", label: "Cash Collected ($)" },
              { name: "revenueGenerated", label: "Revenue Generated ($)" },
            ].map((field) => (
              <div key={field.name}>
                <div className="flex items-center space-x-2">
                  <Label htmlFor={field.name}>{field.label}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        <strong>Description:</strong>{" "}
                        {fieldInfo[field.name].description}
                      </p>
                      <p>
                        <strong>Include:</strong>{" "}
                        {fieldInfo[field.name].include}
                      </p>
                      <p>
                        <strong>Why it matters:</strong>{" "}
                        {fieldInfo[field.name].why}
                      </p>
                      <p>
                        <strong>Exclude:</strong>{" "}
                        {fieldInfo[field.name].exclude}
                      </p>
                      <p>
                        <strong>Important:</strong>{" "}
                        {fieldInfo[field.name].important}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2">
                  <Input
                    type="number"
                    id={field.name}
                    name={field.name}
                    min="0"
                    step={
                      field.name.includes("cash") ||
                      field.name.includes("revenue")
                        ? "0.01"
                        : "1"
                    }
                    defaultValue="0"
                  />
                  {actionData?.errors?.[field.name] && (
                    <p className="mt-2 text-sm text-red-500">
                      {actionData.errors[field.name]}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          disabled={navigation.state === "submitting"}
        >
          Submit Metrics
        </Button>
      </Form>

      {/* Overwrite Confirmation Modal */}
      <Dialog open={showOverwriteModal} onOpenChange={setShowOverwriteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Existing Report Detected</DialogTitle>
            <DialogDescription>
              A report was already submitted on {actionData?.existingDate}.
              Would you like to overwrite it?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleOverwriteConfirm}>Overwrite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Confirmation Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submission Successful</DialogTitle>
            <DialogDescription>
              Your EOD report was submitted successfully!
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleSuccessConfirm}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline CSS to style the calendar icon */}
      <style jsx="true">{`
        .date-input::-webkit-calendar-picker-indicator {
          filter: invert(0.9); /* Dark gray for light mode (~gray-700) */
        }
        .dark .date-input::-webkit-calendar-picker-indicator {
          filter: invert(0.1); /* Light gray for dark mode (~gray-300) */
        }
      `}</style>
    </div>
  )
}
