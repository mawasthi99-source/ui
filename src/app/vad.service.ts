import { Injectable } from '@angular/core';
import { MicVAD } from '@ricky0123/vad-web';

@Injectable({
  providedIn: 'root'
})
export class VadService {
  private vad: any;

  async init(onSpeechEnd: (audio: Float32Array) => void) {
    this.vad = await MicVAD.new({
      onSpeechEnd,
      baseAssetPath: '/',       // worklet + onnx models are served from root
      onnxWASMBasePath: '/',    // wasm + mjs files are served from root
    });

    return this.vad;
  }

  start() {
    if (this.vad) {
      this.vad.start();
    }
  }

  stop() {
    if (this.vad) {
      try {
        // The correct method for @ricky0123/vad-web is usually 'pause' not 'stop'
        if (typeof this.vad.pause === 'function') {
          this.vad.pause();
          console.log('VAD paused successfully');
        } else if (typeof this.vad.stop === 'function') {
          this.vad.stop();
          console.log('VAD stopped successfully');
        } else {
          console.warn('No stop/pause method found on VAD instance');
        }
        
        // Try to destroy the instance to fully release resources
        if (typeof this.vad.destroy === 'function') {
          this.vad.destroy();
          console.log('VAD destroyed successfully');
        }
      } catch (error) {
        console.error('Error stopping VAD:', error);
      } finally {
        // Always clear the reference
        this.vad = null;
      }
    } else {
      console.log('VAD already stopped or not initialized');
    }
  }
}