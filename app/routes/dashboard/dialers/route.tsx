import { useEffect, useState } from "react"
import { json, redirect } from "@remix-run/node"
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
  dialer: { id: string; firstName: string; lastName: string }
}

export const loader: LoaderFunction = async ({ request }) => {
  const dialerId = "67f6010aa713d700b8bee6ec"
  const dialer = await prisma.dialer.findUnique({
    where: { id: dialerId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  })

  if (!dialer) throw new Error("Dialer not found")
  return json<LoaderData>({ dialer })
}

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData()
  const dialerId = "67f6010aa713d700b8bee6ec"
  const date = formData.get("date") as string
  const forceOverwrite = formData.get("forceOverwrite") === "true"

  const metrics = {
    dials: Number(formData.get("dials")),
    connects: Number(formData.get("connects")),
    conversations: Number(formData.get("conversations")),
    qualifiedConversations: Number(formData.get("qualifiedConversations")),
    meetingsScheduled: Number(formData.get("meetingsScheduled")),
    meetingsSet: Number(formData.get("meetingsSet")),
    meetingsShowed: Number(formData.get("meetingsShowed")),
    noShows: Number(formData.get("noShows")),
    closedDeals: Number(formData.get("closedDeals")),
    revenueGenerated: Number(formData.get("revenueGenerated")),
    cashCollected: Number(formData.get("cashCollected")),
  }

  const errors: { [key: string]: string } = {}
  if (!date) errors.date = "Please select a date"
  Object.entries(metrics).forEach(([key, value]) => {
    if (isNaN(value) || value < 0) {
      errors[key] = "Please enter a valid number"
    }
  })

  if (metrics.connects > metrics.dials) {
    errors.connects = "Connects cannot exceed Dials"
  } else if (metrics.conversations > metrics.connects) {
    errors.conversations = "Conversations cannot exceed Connects"
  } else if (metrics.qualifiedConversations > metrics.conversations) {
    errors.qualifiedConversations =
      "Qualified Conversations cannot exceed Conversations"
  } else if (metrics.meetingsScheduled < 0) {
    errors.meetingsScheduled = "Meetings Scheduled cannot be negative"
  } else if (metrics.meetingsShowed > metrics.meetingsSet) {
    errors.meetingsShowed = "Meetings Showed cannot exceed Meetings Set"
  } else if (metrics.noShows > metrics.meetingsSet) {
    errors.noShows = "No Shows cannot exceed Meetings Set"
  } else if (metrics.meetingsSet != metrics.meetingsShowed + metrics.noShows) {
    errors.meetingsSet = "Meetings Set must equal Meetings Showed + No Shows"
  } else if (metrics.closedDeals > metrics.meetingsShowed) {
    errors.closedDeals = "Closed Deals cannot exceed Meetings Showed"
  } else if (metrics.revenueGenerated < 0 && metrics.closedDeals > 0) {
    errors.revenueGenerated =
      "Revenue Generated must be greater than 0 if Closed Deals > 0"
  } else if (metrics.cashCollected > 0 && metrics.closedDeals <= 0) {
    errors.closedDeals =
      "Closed Deals must be greater than 0 if cash was collected"
  }

  if (!forceOverwrite) {
    const existingMetric = await prisma.dialerMetrics.findUnique({
      where: {
        dialerId_date: {
          dialerId,
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

  await prisma.dialerMetrics.upsert({
    where: {
      dialerId_date: {
        dialerId,
        date: new Date(date),
      },
    },
    update: metrics,
    create: {
      ...metrics,
      dialerId,
      date: new Date(date),
    },
  })

  return json<ActionData>({ success: true })
}

const fieldInfo = {
  dials: {
    description: "Enter the total number of dials made today.",
    include: "All outbound call attempts.",
    why: "Tracks daily activity volume.",
    exclude: "Inbound calls or follow-ups.",
    important: "Base metric for dialer performance.",
  },
  connects: {
    description: "Enter the total number of successful connections.",
    include: "Calls where someone answered.",
    why: "Measures contact rate.",
    exclude: "Voicemails or no-answers.",
    important: "Must not exceed Dials.",
  },
  conversations: {
    description: "Enter the total number of actual conversations held.",
    include: "Calls with meaningful dialogue.",
    why: "Tracks engagement success.",
    exclude: "Brief connects without conversation.",
    important: "Must not exceed Connects.",
  },
  qualifiedConversations: {
    description: "Enter the total number of qualified conversations.",
    include: "Conversations meeting qualification criteria.",
    why: "Tracks lead quality.",
    exclude: "Unqualified or irrelevant talks.",
    important: "Must not exceed Conversations.",
  },
  meetingsScheduled: {
    description: "Enter the total number of meetings scheduled today.",
    include: "All meetings booked for any date.",
    why: "Tracks pipeline generation.",
    exclude: "Meetings not confirmed.",
    important: "Reflects conversion from conversations.",
  },
  meetingsSet: {
    description: "Enter the total number of meetings confirmed for today.",
    include: "Meetings scheduled and set for today.",
    why: "Tracks today’s booked opportunities.",
    exclude: "Future or unconfirmed meetings.",
    important: "Must equal Meetings Showed + No Shows.",
  },
  meetingsShowed: {
    description: "Enter the total number of meetings that occurred.",
    include: "Meetings where prospects attended.",
    why: "Measures attendance rate.",
    exclude: "No-shows or cancellations.",
    important: "Must not exceed Meetings Set.",
  },
  noShows: {
    description:
      "Enter the total number of meetings where prospects didn’t show.",
    include: "Scheduled meetings with no attendance.",
    why: "Tracks missed opportunities.",
    exclude: "Attended or cancelled meetings.",
    important: "Complements Meetings Showed.",
  },
  closedDeals: {
    description: "Enter the total number of deals closed today.",
    include: "Finalized sales from meetings.",
    why: "Tracks sales success.",
    exclude: "Pending or negotiated deals.",
    important: "Must not exceed Meetings Showed.",
  },
  revenueGenerated: {
    description: "Enter the total revenue from closed deals.",
    include: "Full sale value (including deferred revenue).",
    why: "Tracks overall deal value.",
    exclude: "Non-finalized deals.",
    important: "If > 0, Closed Deals > 0.",
  },
  cashCollected: {
    description: "Enter the total cash collected from closed deals.",
    include: "Upfront payments received today.",
    why: "Tracks immediate financial impact.",
    exclude: "Deferred payments.",
    important: "If > 0, Closed Deals > 0.",
  },
}

export default function Dialers() {
  const { dialer } = useLoaderData<LoaderData>()
  const actionData = useActionData<ActionData>()
  const navigation = useNavigation()
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [showOverwriteModal, setShowOverwriteModal] = useState(false)
  const [forceOverwrite, setForceOverwrite] = useState(false)

  useEffect(() => {
    if (actionData?.existingDate && !forceOverwrite) {
      setShowOverwriteModal(true)
    } else if (actionData?.success) {
      setForceOverwrite(false) // Reset after successful submission
    }
  }, [actionData, forceOverwrite])

  const handleOverwriteConfirm = () => {
    setForceOverwrite(true)
    setShowOverwriteModal(false)
    // The form will resubmit automatically due to the hidden input
  }

  const handleCancel = () => {
    setShowOverwriteModal(false)
  }

  return (
    <div className="container mx-auto max-w-4xl p-4">
      <h2 className="mt-10 text-center text-2xl font-bold leading-9 tracking-tight">
        Daily Metrics for {dialer.firstName} {dialer.lastName}
      </h2>

      <Form method="post" className="mt-10 space-y-6">
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
              { name: "dials", label: "Dials" },
              { name: "connects", label: "Connects" },
              { name: "conversations", label: "Conversations" },
              {
                name: "qualifiedConversations",
                label: "Qualified Conversations",
              },
              { name: "meetingsScheduled", label: "Meetings Scheduled" },
              { name: "meetingsSet", label: "Meetings Set" },
              { name: "meetingsShowed", label: "Meetings Showed" },
              { name: "noShows", label: "No Shows" },
              { name: "closedDeals", label: "Closed Deals" },
              { name: "revenueGenerated", label: "Revenue Generated ($)" },
              { name: "cashCollected", label: "Cash Collected ($)" },
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

      {/* Inline CSS to style the calendar icon */}
      <style jsx>{`
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
