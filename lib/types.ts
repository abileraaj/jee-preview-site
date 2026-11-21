export type Role = "student" | "faculty" | "admin";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  class_year: "11" | "12" | "dropper" | null;
  state: string | null;
  role: Role;
  is_minor: boolean | null;
  guardian_name: string | null;
  guardian_mobile: string | null;
  guardian_consent_at: string | null;
  onboarded_at: string | null;
  created_at: string;
};
