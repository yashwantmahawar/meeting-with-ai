#!/bin/bash
echo "🔄 Restarting AI Meeting Agent background service..."
launchctl unload ~/Library/LaunchAgents/com.myashwant.meetingagent.plist
launchctl load -w ~/Library/LaunchAgents/com.myashwant.meetingagent.plist
launchctl start com.myashwant.meetingagent
echo "✅ Service restarted successfully!"
launchctl list | grep "meetingagent"
