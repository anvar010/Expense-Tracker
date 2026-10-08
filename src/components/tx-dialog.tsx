"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useData } from "@/lib/store/data-provider";
import { useCollection } from "@/lib/store/use-collection";
import { CURRENCIES, DEFAULT_CATEGORIES, TX_TYPES, type Account, type Tx } from "@/lib/types";

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
  const { register, watch, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
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
        className="card max-h-[92dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-b-none p-6 sm:rounded-b-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{editing ? "Edit transaction" : "Add transaction"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-ghost size-10 !p-0"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="type">Type</label>
            <select id="type" className="input" {...register("type")}>
              {TX_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="date">Date</label>
            <input id="date" type="date" className="input" {...register("date")} />
            {errors.date && <p className="mt-1 text-xs text-danger">{errors.date.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="amount">Amount</label>
            <input id="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" className="input num" {...register("amount")} />
            {errors.amount && <p className="mt-1 text-xs text-danger">{errors.amount.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="currency">Currency</label>
            <select id="currency" className="input" {...register("currency")}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {accounts.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="accountId">{isMove ? "From account" : "Account"}</label>
              <select id="accountId" className="input" {...register("accountId")}>
                <option value="">{isMove ? "Choose…" : "None"}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {isMove && (
              <div>
                <label className="label" htmlFor="toAccountId">{watch("type") === "CARD_PAYMENT" ? "Card paid" : "To account"}</label>
                <select id="toAccountId" className="input" {...register("toAccountId")}>
                  <option value="">Choose…</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {errors.toAccountId && <p className="mt-1 text-xs text-danger">{errors.toAccountId.message}</p>}
              </div>
            )}
          </div>
        )}
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select id="category" className="input" {...register("category")}>
            {DEFAULT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="merchant">Merchant</label>
          <input id="merchant" autoComplete="off" placeholder="e.g. Carrefour" className="input" {...register("merchant")} />
        </div>
        <div>
          <label className="label" htmlFor="notes">Notes</label>
          <input id="notes" autoComplete="off" className="input" {...register("notes")} />
        </div>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save"}</button>
      </motion.form>
    </motion.div>
  );
}
