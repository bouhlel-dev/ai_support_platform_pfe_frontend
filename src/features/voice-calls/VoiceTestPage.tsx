import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  BarVisualizer,
  useVoiceAssistant,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { voiceAgentsApi } from '@/shared/api/voiceAgents';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Mic } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function AgentVisualizer() {
  const { state, audioTrack } = useVoiceAssistant();
  
  let label = 'Agent is disconnected...';
  if (state === 'initializing') label = 'Agent is initializing...';
  if (state === 'listening') label = 'Agent is listening...';
  if (state === 'thinking') label = 'Agent is thinking...';
  if (state === 'speaking') label = 'Agent is speaking...';

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-950 rounded-2xl border border-zinc-800 h-64 shadow-inner relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-zinc-900/50 pointer-events-none" />
      <div className="h-24 w-full max-w-sm mb-6">
        <BarVisualizer
          state={state}
          barCount={7}
          trackRef={audioTrack}
          className="h-full w-full opacity-90"
        />
      </div>
      <p className="text-zinc-400 text-sm font-medium animate-pulse">{label}</p>
    </div>
  );
}

export function VoiceTestPage() {
  const [active, setActive] = useState(false);

  const tokenQuery = useQuery({
    queryKey: ['voice-test-token'],
    queryFn: voiceAgentsApi.getTestToken,
    enabled: active, // Only fetch token when connecting
    retry: false,
  });

  const handleConnect = () => {
    setActive(true);
  };

  const handleDisconnect = () => {
    setActive(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Test Voice Agent</h1>
          <p className="text-muted-foreground mt-1">
            Connect your microphone to test the voice pipeline and interact with the AI assistant in real-time.
          </p>
        </div>
      </div>

      {!active ? (
        <div className="bg-card rounded-xl border p-8 text-center space-y-4 shadow-sm">
          <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
            <Mic className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Ready to Test</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Make sure your microphone is enabled. Once you connect, you will instantly join a local LiveKit room and your voice agent will be triggered.
          </p>
          <Button size="lg" onClick={handleConnect} className="mt-4 shadow-md hover:shadow-lg transition-shadow">
            Connect to Room
          </Button>
        </div>
      ) : tokenQuery.isLoading ? (
        <div className="bg-card rounded-xl border p-12 text-center space-y-4 shadow-sm flex flex-col items-center">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
          <h2 className="text-lg font-medium animate-pulse">Generating Secure Access Token...</h2>
          <p className="text-sm text-muted-foreground">Contacting the local Support Ops API</p>
        </div>
      ) : tokenQuery.isError ? (
        <Alert variant="destructive" className="max-w-2xl mx-auto shadow-sm">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Connection Failed</AlertTitle>
          <AlertDescription className="mt-2 text-sm leading-relaxed">
            Could not fetch the LiveKit Token from the backend. Please verify your LiveKit API Key and Secret are properly configured on the Voice Agents page.
            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={handleDisconnect} className="bg-white/10 hover:bg-white/20 text-white border-white/20">
                Cancel Test
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : tokenQuery.data ? (
        <div className="space-y-6">
          <LiveKitRoom
            token={tokenQuery.data.token}
            serverUrl={tokenQuery.data.url}
            connect={true}
            onDisconnected={handleDisconnect}
            audio={true}
            className="w-full flex justify-center flex-col gap-6"
          >
            {/* Renders audio coming from the agent */}
            <RoomAudioRenderer />

            {/* Agent Voice Activity Visualizer */}
            <AgentVisualizer />

            {/* The LiveKit standard bottom control bar for user mic controls */}
            <div className="flex justify-center mt-2 group relative">
              <div className="absolute inset-0 bg-primary/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative shadow-lg ring-1 ring-border rounded-full bg-background/50 backdrop-blur-md">
                <VoiceAssistantControlBar />
              </div>
            </div>
          </LiveKitRoom>
          <div className="text-center text-xs text-muted-foreground">
            <p>Connected to <strong>{tokenQuery.data.url}</strong></p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
