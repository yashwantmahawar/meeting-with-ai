# Changelog

All notable changes to this project will be documented in this file.

## [v1.1.0] - 2026-07-20
### Added
- **Export to Google Docs:** Enhanced the export functionality to natively support rich text copying to Google Docs.
- **Copy to Clipboard buttons:** Added inline rich-text copy buttons across MOM, Action Items, and Transcript tabs.
- **Cloud Run Deployment:** Added configurations (`Dockerfile`, `start.sh`) for Google Cloud Run deployment.
- **History Toggle:** Added `.env` variable `ENABLE_HISTORY` to conditionally disable local SQLite logging in stateless cloud environments.
- **UI Error Toasts:** Replaced intrusive browser alert modals with sleek, animated in-app toast notifications.
- **Conditional Tab Focus:** Implemented Chrome's `CaptureController` API to natively prevent the browser from switching tabs if screen sharing is cancelled or audio is missing.

### Fixed
- Fixed formatting issues when exporting meeting documents into non-Microsoft word processors.
- Fixed a speaker diarization bug where the AI would incorrectly guess or hallucinate the names of speakers.
- Fixed a recording setup bug where cancelling the screen share prompt would incorrectly proceed with a microphone-only recording.
- Fixed an edge case where users could share a tab without checking "Share tab audio", resulting in silent recordings.

## [v1.0.0] - Initial Release
### Added
- Real-time meeting recording and transcription using Web Speech API.
- Live integration with Gemini API to generate real-time meeting insights and follow-up questions.
- Post-meeting generation of:
  - Minutes of Meeting (MOM)
  - Action Items
  - Follow-Up Email Drafts
- Meeting analytics dashboard (WPM, Speaking turns).
- Local history saving via SQLite.
