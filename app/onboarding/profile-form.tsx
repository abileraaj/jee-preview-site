"use client";

import { useActionState, useState } from "react";
import { INDIAN_STATES } from "@/lib/states";
import type { Profile } from "@/lib/types";
import { saveProfile, type ProfileFormState } from "./actions";

const initial: ProfileFormState = { error: null };

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(saveProfile, initial);
  const [ageGroup, setAgeGroup] = useState<string>(
    profile.is_minor === null ? "" : profile.is_minor ? "under18" : "adult",
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="full_name" className="label">Full name</label>
        <input id="full_name" name="full_name" required className="field"
          autoComplete="name" defaultValue={profile.full_name ?? ""} />
      </div>
      <div>
        <label htmlFor="mobile" className="label">Mobile number</label>
        <input id="mobile" name="mobile" required className="field" inputMode="numeric"
          autoComplete="tel-national" maxLength={10} pattern="[6-9][0-9]{9}"
          placeholder="10 digits" defaultValue={profile.mobile ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="class_year" className="label">Class</label>
          <select id="class_year" name="class_year" required className="field"
            defaultValue={profile.class_year ?? ""}>
            <option value="" disabled>Choose</option>
            <option value="11">Class 11</option>
            <option value="12">Class 12</option>
            <option value="dropper">12th completed (dropper)</option>
          </select>
        </div>
        <div>
          <label htmlFor="state" className="label">State</label>
          <select id="state" name="state" required className="field"
            defaultValue={profile.state ?? ""}>
            <option value="" disabled>Choose</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="label">Are you under 18?</legend>
        <div className="flex gap-4">
          {[
            ["under18", "Yes, under 18"],
            ["adult", "No, 18 or older"],
          ].map(([value, text]) => (
            <label key={value} className="flex items-center gap-2 text-slate-800">
              <input type="radio" name="age_group" value={value} required
                checked={ageGroup === value} onChange={() => setAgeGroup(value)} />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      {ageGroup === "under18" && (
        <div className="space-y-4 rounded-lg border border-brand-100 bg-brand-50 p-4">
          <p className="text-sm text-slate-700">
            Because you are under 18, a parent or guardian must agree to your using this service.
            Please fill this part in with them.
          </p>
          <div>
            <label htmlFor="guardian_name" className="label">Parent or guardian&apos;s name</label>
            <input id="guardian_name" name="guardian_name" className="field"
              defaultValue={profile.guardian_name ?? ""} />
          </div>
          <div>
            <label htmlFor="guardian_mobile" className="label">Parent or guardian&apos;s mobile</label>
            <input id="guardian_mobile" name="guardian_mobile" className="field" inputMode="numeric"
              maxLength={10} pattern="[6-9][0-9]{9}" placeholder="10 digits"
              defaultValue={profile.guardian_mobile ?? ""} />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-800">
            <input type="checkbox" name="guardian_consent" className="mt-1"
              defaultChecked={Boolean(profile.guardian_consent_at)} />
            <span>
              I am the parent or guardian named above. I agree to my child using this service and
              to their test answers and timings being stored to produce their reports.
            </span>
          </label>
        </div>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button className="btn w-full" disabled={pending}>
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
