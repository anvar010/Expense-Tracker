"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/store/data-provider";
import { useCollection } from "@/lib/store/use-collection";
import { CURRENCIES, DEFAULT_CATEGORIES, TX_TYPES, type Account, type Tx } from "@/lib/types";
import { Select } from "@/components/select";

const formSchema = z.object({
  type: z.enum(TX_TYPES),
  amount: z.string().regex(/^-?\d{1,16}([.,]\d{1,2})?$/, "Enter a valid amount"),
  currency: z.enum(CURRENCIES),
  category: z.string().trim().min(1, "Choose a category"),
  merchant: z.string().trim().max(120),
  date: z.string().min(1, "Pick a date"),
  notes: z.string().trim().max(500),
  accountId: z.string(),
  toAccountId: z.string(),
}).refine((f) => !f.amount.startsWith("-") || f.type === "ADJUSTMENT", { message: "Only adjustments can be negative", path: ["amount"] })
  .refine((f) => !(f.type === "TRANSFER" || f.type === "CARD_PAYMENT") || (f.accountId && f.toAccountId && f.accountId !== f.toAccountId),
    { message: "Pick two different accounts", path: ["toAccountId"] });
type Form = z.infer<typeof formSchema>;

const today = () => new Date().toLocaleDateString("en-CA");
const label = (s: string) => s.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** The form mounts fresh on every open, so its defaults are set at creation (no reset-after-paint race). */
export function TxDialog({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Tx | null }) {
  return <AnimatePresence>{open && <TxForm key={editing?.id ?? "new"} onClose={onClose} editing={editing} />}</AnimatePresence>;
}

function TxForm({ onClose, editing }: { onClose: () => void; editing?: Tx | null }) {
  const { add, update } = useData();
  const { items: accounts } = useCollection<Account>("accounts");
  const [error, setError] = useState("");
  const { register, watch, setValue, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(formSchema),
    defaultValues: editing
      ? { ...editing, accountId: editing.accountId ?? "", toAccountId: editing.toAccountId ?? "", date: new Date(editing.date).toLocaleDateString("en-CA") }
      : { type: "EXPENSE", amount: "", currency: "AED", category: "Food & Dining", merchant: "", date: today(), notes: "", accountId: "", toAccountId: "" },
  });

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const type = watch("type");
  const isDebitCredit = type === "EXPENSE" || type === "INCOME";
  const isMove = ["TRANSFER", "CARD_PAYMENT"].includes(watch("type"));

  const submit = handleSubmit(async (f) => {
    try {
      const input = {
        ...f, amount: f.amount.replace(",", "."),
        accountId: f.accountId || undefined,
        toAccountId: f.toAccountId && (f.type === "TRANSFER" || f.type === "CARD_PAYMENT") ? f.toAccountId : undefined,
        date: new Date(`${f.date}T12:00:00`).toISOString(),
      };
      await (editing ? update(editing.id, input) : add(input));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  });

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      onMouseDown={onClose}
    >
      <motion.form
        initial={{ y: 48, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 32, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        role="dialog" aria-modal="true" aria-label={editing ? "Edit transaction" : "Add transaction"}
        onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}
        className="card flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-b-none sm:rounded-b-2xl"
      >
        <div className="px-5 pt-2.5 sm:pt-5">
          <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-full bg-border sm:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{editing ? "Edit transaction" : "Add transaction"}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="btn-ghost size-10 !p-0"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-3">
          {isDebitCredit ? (
            <div className="space-y-1.5">
              <div role="radiogroup" aria-label="Debit or credit" className="relative grid grid-cols-2 rounded-xl border border-border bg-surface-2 p-1">
                <motion.span
                  aria-hidden className={cn("absolute inset-y-1 w-[calc(50%-4px)] rounded-lg", type === "EXPENSE" ? "bg-danger/20" : "bg-accent/20")}
                  animate={{ left: type === "EXPENSE" ? 4 : "50%" }} transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
                {([["EXPENSE", "Debit"], ["INCOME", "Credit"]] as const).map(([value, text]) => (
                  <button
                    key={value} type="button" role="radio" aria-checked={type === value}
                    onClick={() => setValue("type", value, { shouldDirty: true })}
                    className={cn("relative z-10 min-h-11 rounded-lg text-sm font-medium", type === value ? "text-foreground" : "text-muted")}
                  >{text}</button>
                ))}
              </div>
              <button type="button" className="block text-xs text-muted underline" onClick={() => setValue("type", "TRANSFER", { shouldDirty: true })}>Transfer, card payment or other</button>
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="type">Type</label>
              <Select id="type" className="input" {...register("type")}>
                {TX_TYPES.filter((t) => t !== "EXPENSE" && t !== "INCOME").map((t) => <option key={t} value={t}>{label(t)}</option>)}
              </Select>
              <button type="button" className="mt-1.5 block text-xs text-muted underline" onClick={() => setValue("type", "EXPENSE", { shouldDirty: true })}>Back to debit / credit</button>
            </div>
          )}

          {/* The amount is the main thing, so it gets the most room. */}
          <div className="rounded-2xl bg-surface-2 px-4 py-3 text-center">
            <label className="label !mb-0 text-center" htmlFor="amount">Amount</label>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-base font-medium text-muted">{watch("currency")}</span>
              <input
                id="amount" inputMode="decimal" autoComplete="off" placeholder="0.00"
                className="num keep-size w-40 min-w-0 bg-transparent py-1 text-center text-4xl font-semibold !outline-none placeholder:text-muted/50"
                {...register("amount")}
              />
            </div>
            {errors.amount && <p className="text-xs text-danger">{errors.amount.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="label" htmlFor="category">Category</label>
              <Select id="category" className="input" {...register("category")}>
                {DEFAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </div>
            <div className="min-w-0">
              <label className="label" htmlFor="date">Date</label>
              <input id="date" type="date" className="input" {...register("date")} />
              {errors.date && <p className="mt-1 text-xs text-danger">{errors.date.message}</p>}
            </div>
          </div>

          {accounts.length > 0 && (
            <div className={cn("grid gap-3", isMove && "grid-cols-2")}>
              <div className="min-w-0">
                <label className="label" htmlFor="accountId">{isMove ? "From account" : "Account"}</label>
                <Select id="accountId" className="input" {...register("accountId")}>
                  <option value="">{isMove ? "Choose…" : "None"}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </div>
              {isMove && (
                <div className="min-w-0">
                  <label className="label" htmlFor="toAccountId">{type === "CARD_PAYMENT" ? "Card paid" : "To account"}</label>
                  <Select id="toAccountId" className="input" {...register("toAccountId")}>
                    <option value="">Choose…</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                  {errors.toAccountId && <p className="mt-1 text-xs text-danger">{errors.toAccountId.message}</p>}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="label" htmlFor="merchant">Merchant</label>
            <input id="merchant" autoComplete="off" placeholder="e.g. Carrefour" className="input" {...register("merchant")} />
          </div>
          <div>
            <label className="label" htmlFor="notes">Notes <span className="font-normal">(optional)</span></label>
            <input id="notes" autoComplete="off" className="input" {...register("notes")} />
          </div>

          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>

        {/* Save stays in view while the fields scroll. */}
        <div className="flex gap-3 border-t border-border bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={onClose} className="btn-ghost min-h-12 px-5 text-base">Close</button>
          <button className="btn-primary min-h-12 flex-1 text-base" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save"}</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
