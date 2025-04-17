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
  setter: { id: string; firstName: string; lastName: string }
}

export const loader: LoaderFunction = async ({ request }) => {
  const setterId = "67fdc943d17d6b5629513257"
  const setter = await prisma.setter.findUnique({
    where: { id: setterId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  })

  if (!setter) throw new Error("Setter not found")
  return json<LoaderData>({ setter })
}

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData()
  const setterId = "67fdc943d17d6b5629513257"
  const date = formData.get("date") as string
  const forceOverwrite = formData.get("forceOverwrite") === "true"

  const metrics = {
    dailyOutboundConversations: Number(
      formData.get("dailyOutboundConversations")
    ),
    inboundConversations: Number(formData.get("inboundConversations")),
    followUps: Number(formData.get("followUps")),
    callsProposed: Number(formData.get("callsProposed")),
    totalHighTicketSalesCallsBooked: Number(
      formData.get("totalHighTicketSalesCallsBooked")
    ),
    setsScheduled: Number(formData.get("setsScheduled")),
    setsTaken: Number(formData.get("setsTaken")),
    closedSets: Number(formData.get("closedSets")),
    revenueGenerated: Number(formData.get("revenueGenerated")),
    newCashCollected: Number(formData.get("newCashCollected")),
    recurringCashCollected: Number(formData.get("recurringCashCollected")),
    downsellRevenue: Number(formData.get("downsellRevenue")),
  }

  const errors: { [key: string]: string } = {}
  if (!date) errors.date = "Please select a date"
  Object.entries(metrics).forEach(([key, value]) => {
    if (isNaN(value) || value < 0) {
      errors[key] = "Please enter a valid number"
    }
  })

  if (
    metrics.callsProposed >
    metrics.dailyOutboundConversations +
      metrics.inboundConversations +
      metrics.followUps
  ) {
    errors.callsProposed =
      "Cannot exceed New Outbound Convos + New Inbound Convos + Follow-Ups"
  } else if (metrics.callsProposed < metrics.totalHighTicketSalesCallsBooked) {
    errors.totalHighTicketSalesCallsBooked = "Cannot exceed Calls Proposed"
  } else if (metrics.setsTaken > metrics.setsScheduled) {
    errors.setsTaken = "Cannot exceed Sets Scheduled Today"
  } else if (metrics.closedSets > metrics.setsTaken) {
    errors.closedSets = "Cannot exceed Sets Taken Today"
  } else if (
    metrics.revenueGenerated <
    metrics.newCashCollected +
      metrics.recurringCashCollected +
      metrics.downsellRevenue
  ) {
    errors.revenueGenerated =
      "Must be greater than or equal to New Cash Collected + Recurring Cash Collected + Downsell Revenue"
  } else if (metrics.newCashCollected > metrics.revenueGenerated) {
    errors.newCashCollected = "Cannot exceed Revenue Generated"
  } else if (metrics.recurringCashCollected > metrics.revenueGenerated) {
    errors.recurringCashCollected = "Cannot exceed Revenue Generated"
  } else if (metrics.downsellRevenue > metrics.revenueGenerated) {
    errors.downsellRevenue = "Cannot exceed Revenue Generated"
  }

  if (!forceOverwrite) {
    const existingMetric = await prisma.setterMetrics.findUnique({
      where: {
        setterId_date: {
          setterId,
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

  await prisma.setterMetrics.upsert({
    where: {
      setterId_date: {
        setterId,
        date: new Date(date),
      },
    },
    update: metrics,
    create: {
      ...metrics,
      setterId,
      date: new Date(date),
    },
  })

  return json<ActionData>({ success: true })
}

const fieldInfo = {
  dailyOutboundConversations: {
    description:
      "Enter the total number of new conversations you initiated today.",
    include: "All calls, messages, or emails sent to prospects.",
    why: "Tracks your outbound activity and prospecting efforts.",
    exclude: "Follow-ups or conversations where the lead contacted you first.",
    important: "Ensure you record only unique outbound efforts.",
  },
  inboundConversations: {
    description:
      "Enter the total number of new conversations initiated by leads today.",
    include: "All inbound messages where a lead reached out to you.",
    why: "Measures the volume and effectiveness of inbound lead flow.",
    exclude: "Follow-ups or ongoing conversations with existing leads.",
    important: "Count only leads that initiated contact today.",
  },
  followUps: {
    description:
      "Enter the total number of follow-up conversations conducted today.",
    include: "All interactions with leads you’ve contacted before.",
    why: "Tracks how well you are nurturing your pipeline.",
    exclude: "New conversations or outreach to inactive leads.",
    important:
      "Cross-check with your CRM or activity logs to avoid double-counting.",
  },
  callsProposed: {
    description: "Enter the total number of calls you proposed to leads today.",
    include:
      "All call suggestions explicitly offered, regardless of whether they were accepted.",
    why: "Provides context for booking efficiency and overall lead engagement.",
    exclude: "Calls discussed but not formally proposed.",
    important: "Ensure consistency with booked calls and total conversations.",
  },
  totalHighTicketSalesCallsBooked: {
    description:
      "Enter the total number of high-ticket sales calls successfully booked today.",
    include: "All confirmed calls scheduled for high-ticket offers.",
    why: "Tracks your core activity of setting sales calls.",
    exclude: "Low-ticket calls or unconfirmed proposals.",
    important: "Verify against calendar or CRM bookings.",
  },
  setsScheduled: {
    description: "Enter the total number of sets scheduled for today.",
    include:
      "All confirmed appointments set to occur today, regardless of when they were booked.",
    why: "Tracks how many leads are scheduled to attend calls today, including those booked on prior days.",
    exclude: "Declined or pending call proposals.",
    important: "Double-check against proposed calls to ensure accuracy.",
  },
  setsTaken: {
    description:
      "Enter the total number of scheduled sets that occurred today.",
    include: "All sets where the lead attended the appointment.",
    why: "Tracks lead engagement and show-up rates.",
    exclude: "No-shows or rescheduled sets.",
    important: "Ensure accuracy by cross-referencing with attendance logs.",
  },
  closedSets: {
    description:
      "Enter the total number of sets that resulted in closed deals today.",
    include: "All appointments that led to a successful sale.",
    why: "Tracks your conversion rate and revenue contributions.",
    exclude: "Pending deals or follow-ups.",
    important: "Verify this number against actual deal closures.",
  },
  revenueGenerated: {
    description: "Enter the total revenue generated from closed deals today.",
    include: "Combined revenue from all high-ticket sales and other offers.",
    why: "Tracks financial outcomes and contribution to company growth.",
    exclude: "Deals that are still pending or in follow-up stages.",
    important:
      "Ensure this figure matches the breakdown of collected cash and downsell revenue.",
  },
  newCashCollected: {
    description:
      "Enter the total upfront cash collected from closed deals today.",
    include: "Initial payments made at the time of sale.",
    why: "Reflects immediate cash flow contributions.",
    exclude: "Recurring payments or revenue not yet collected.",
    important:
      "Ensure this value is consistent with closed deals and total revenue.",
  },
  recurringCashCollected: {
    description:
      "Enter the total recurring payments collected from closed deals today.",
    include: "Subscription or installment payments received.",
    why: "Tracks ongoing revenue streams.",
    exclude: "Initial payments or revenue not collected today.",
    important: "Double-check that this aligns with total revenue figures.",
  },
  downsellRevenue: {
    description:
      "Enter the total revenue generated from downsell offers today.",
    include: "Revenue from lower-ticket offers made to leads.",
    why: "Captures additional contributions to total revenue.",
    exclude: "High-ticket sales or pending deals.",
    important: "Verify this value does not inflate total revenue.",
  },
}

export default function SettersEOD() {
  const { setter } = useLoaderData<LoaderData>()
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
      const forceOverwriteInput = formRef.current.querySelector(
        'input[name="forceOverwrite"]'
      ) as HTMLInputElement
      if (forceOverwriteInput) {
        forceOverwriteInput.value = "true"
      }
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
        Setter EOD Form
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
              {
                name: "dailyOutboundConversations",
                label: "New Outbound Conversations",
              },
              {
                name: "inboundConversations",
                label: "New Inbound Conversations",
              },
              { name: "followUps", label: "Follow Ups" },
              { name: "callsProposed", label: "Calls Proposed" },
              {
                name: "totalHighTicketSalesCallsBooked",
                label: "High-Ticket Sales Calls Booked",
              },
              { name: "setsScheduled", label: "Sets Scheduled Today" },
              { name: "setsTaken", label: "Sets Taken Today" },
              { name: "closedSets", label: "Closed Sets" },
              { name: "revenueGenerated", label: "Revenue Generated ($)" },
              { name: "newCashCollected", label: "New Cash Collected ($)" },
              {
                name: "recurringCashCollected",
                label: "Recurring Cash Collected ($)",
              },
              { name: "downsellRevenue", label: "Downsell Revenue ($)" },
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
                      field.name.includes("Cash") ||
                      field.name.includes("Revenue")
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
