# Changelog

All notable changes to this project will be documented in this file.

## [v1.1.0] - 2026-07-20
### Added
- **Export to Google Docs:** Enhanced the export functionality to natively support rich text copying to Google Docs.
- **Copy to Clipboard buttons:** Added inline rich-text copy buttons across MOM, Action Items, and Transcript tabs.
- **Cloud Run Deployment:** Added configurations (`Dockerfile`, `start.sh`) for Google Cloud Run deployment.
- **History Toggle:** Added `.env` variable `ENABLE_HISTORY` to conditionally disable local SQLite logging in stateless cloud environments.

### Fixed
- Fixed formatting issues when exporting meeting documents into non-Microsoft word processors.

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
