import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { VadService } from './vad.service';

interface AudioClip {
  url: string;
  duration: number;
}
//app component.ts
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {

  clips: AudioClip[] = [];
  private silenceTimer: any;
  private readonly SILENCE_TIMEOUT = 4000; // 4 seconds
  accumulatedAudio: Float32Array[] = []; // Made public for template access
  isRecording = false; // Made public for template access
  private recordingCount = 0; // Track number of recordings sent

  constructor(private vadService: VadService, private ngZone: NgZone) {}

  async ngOnInit() {
    await this.vadService.init(
      // onSpeechEnd callback
      (audio: Float32Array) => {
        console.log('Speech ended, audio length:', audio.length);

        // Only process if recording is active
        if (!this.isRecording) return;

        // Clear any existing silence timer
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
        }

        // Add this audio segment to accumulated audio
        this.accumulatedAudio.push(audio);
        console.log(`Added audio segment. Total segments: ${this.accumulatedAudio.length}`);

        // Start silence timer - if no speech for 4 seconds, send combined recording
        this.silenceTimer = setTimeout(() => {
          console.log('4 seconds of silence detected - sending combined recording');
          this.sendCurrentRecordingSession();
        }, this.SILENCE_TIMEOUT);
      }
    );
  }

  start() {
    this.isRecording = true;
    this.accumulatedAudio = []; // Reset accumulated audio for new session
    this.vadService.start();
    console.log('Recording started - new session beginning');
  }

  stop() {
    if (!this.isRecording) {
      console.log('Already stopped');
      return;
    }

    console.log('Stop button clicked - ending current recording session');
    
    // Clear silence timer
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    // Send any accumulated audio from current session
    if (this.accumulatedAudio.length > 0) {
      this.sendCurrentRecordingSession();
    }
    
    // Stop recording flag first
    this.isRecording = false;
    
    // Stop VAD with error handling
    try {
      this.vadService.stop();
      console.log('Recording stopped manually');
    } catch (error) {
      console.error('Error stopping VAD service:', error);
    }
  }

  private sendCurrentRecordingSession() {
    if (this.accumulatedAudio.length === 0) {
      console.log('No audio to send for current session');
      return;
    }

    // Combine all audio segments from current session into one
    const combinedAudio = this.combineAudioSegments(this.accumulatedAudio);
    const combinedBlob = this.floatToWav(combinedAudio, 16000);
    const url = URL.createObjectURL(combinedBlob);
    
    this.recordingCount++;
    console.log(`Sending recording session ${this.recordingCount}:`, combinedBlob);
    console.log(`Session ${this.recordingCount} duration:`, combinedAudio.length / 16000, 'seconds');
    
    // Add combined recording to UI
    this.ngZone.run(() => {
      this.clips.push({
        url,
        duration: combinedAudio.length / 16000
      });
    });
    
    // TODO: Send combinedBlob to your API/service here
    // await this.yourRecordingService.sendRecording(combinedBlob);
    
    // Reset accumulated audio for next session (but keep recording active)
    this.accumulatedAudio = [];
    
    console.log(`Recording session ${this.recordingCount} sent. Ready for next session...`);
  }

  private combineAudioSegments(segments: Float32Array[]): Float32Array {
    // Calculate total length
    const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
    
    // Create combined array
    const combined = new Float32Array(totalLength);
    let offset = 0;
    
    // Copy each segment
    for (const segment of segments) {
      combined.set(segment, offset);
      offset += segment.length;
    }
    
    return combined;
  }

  ngOnDestroy() {
    // Clear any active timer
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }
    
    // Stop recording gracefully
    this.isRecording = false;
    try {
      this.vadService.stop();
    } catch (error) {
      console.error('Error in ngOnDestroy:', error);
    }
    
    // Revoke all URLs to avoid memory leaks
    this.clips.forEach(c => URL.revokeObjectURL(c.url));
  }

  /**
   * Convert Float32 PCM -> WAV Blob
   */
  private floatToWav(float32Array: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + float32Array.length * 2);
    const view = new DataView(buffer);

    // Write WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + float32Array.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, float32Array.length * 2, true);

    // PCM samples
    let offset = 44;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
}