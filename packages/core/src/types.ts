export type EvidenceStatus = 'supported' | 'warning' | 'unsupported';

export interface ResumeProject {
  id: string;
  name: string;
  facts: string[];
  keywords: string[];
}

export interface ResumeProfile {
  id: string;
  name: string;
  headline: string;
  education: string[];
  targetRoles: string[];
  targetLocations: string[];
  skills: string[];
  projects: ResumeProject[];
  excludedKeywords: string[];
  maxRequiredExperienceYears: number;
  greetingStyle: '简洁' | '项目' | '技术';
}

export interface JobPosting {
  platform: 'boss' | 'unknown';
  url: string;
  title: string;
  company: string;
  salary: string;
  location: string;
  experience: string;
  education: string;
  description: string;
  tags: string[];
  recruiter: string;
  capturedAt: string;
}

export interface MatchDimension {
  key: 'role' | 'skill' | 'location' | 'experience' | 'risk';
  label: string;
  score: number;
  maxScore: number;
  reasons: string[];
}

export interface MatchResult {
  score: number;
  blocked: boolean;
  blockReasons: string[];
  matchedSkills: string[];
  missingSkills: string[];
  dimensions: MatchDimension[];
}

export interface ClaimCheck {
  text: string;
  status: EvidenceStatus;
  evidence: string[];
  reason: string;
}

export interface GreetingResult {
  text: string;
  safe: boolean;
  checks: ClaimCheck[];
}

export interface PreferencePatch {
  targetRoles: string[];
  targetLocations: string[];
  excludedKeywords: string[];
}
