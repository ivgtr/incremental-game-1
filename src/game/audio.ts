import type { GameEvent } from './types';

export class GameAudio {
  private context: AudioContext | null = null;

  unlock(): void {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }

  handle(event: GameEvent): void {
    if (!this.context) return;
    if (event.type === 'MINER_SWING_HIT') this.tone(118, 0.055, 'square', 0.045);
    if (event.type === 'ELEVATOR_DEPART') this.sequence([520, 390], 0.05, 0.035);
    if (event.type === 'ELEVATOR_ARRIVE_SURFACE') this.sequence([330, 520], 0.055, 0.035);
    if (event.type === 'RESOURCE_GAIN') this.sequence([440, 660, 880], 0.045, 0.025);
    if (event.type === 'EQUIPMENT_UPGRADE') this.sequence([392, 523, 659], 0.07, 0.035);
    if (event.type === 'LOOT_SPAWN' && event.data?.rarity === 'RARE') {
      this.sequence([740, 988, 1175], 0.08, 0.03);
    }
  }

  private sequence(frequencies: number[], duration: number, gain: number): void {
    frequencies.forEach((frequency, index) => this.tone(frequency, duration, 'square', gain, index * duration * 0.8));
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    delay = 0,
  ): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }
}
