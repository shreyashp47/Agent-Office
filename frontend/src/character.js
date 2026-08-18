// Character: sprite pose animation + state->zone tweening + speech bubbles
// (milestone M3, issues #12 and #13). Zone map per PLAN.md section 5.1.

import { clampText, pickSpot, stepToward, WALK_SPEED } from "./logic.js";
import { drawIconBubble, drawSpeechBubble } from "./bubbles.js";

const STATE_ICON = {
  idle: "💤",
  thinking: "💭",
  waiting: "❗",
  error: "🔥",
};

const STATE_POSE = {
  idle: "sit",
  writing: "type",
  researching: "read",
  executing: "type",
  thinking: "think",
  waiting: "wait",
  error: "error",
};

export class Character {
  constructor({ id, name, sprite, layout }) {
    this.id = id;
    this.name = name;
    this.sprite = sprite;
    this.layout = layout;
    this.state = "idle";
    this.detail = null;
    this.zone = null;
    const spot = pickSpot(layout, layout.stateZone?.idle ?? "sofa", id) ?? { x: 480, y: 270 };
    this.x = spot.x;
    this.y = spot.y;
    this.target = spot;
    this.dir = "down";
    this.pose = "sit";
    this.frame = 0;
    this.animTime = 0;
    this.moving = false;
  }

  setState(state, detail, zone) {
    this.state = state;
    this.detail = detail ?? null;
    const z = zone ?? this.layout.stateZone?.[state] ?? this.zone ?? "sofa";
    if (z !== this.zone) {
      this.zone = z;
      const spot = pickSpot(this.layout, z, this.id);
      if (spot) this.target = spot;
    }
  }

  update(dt) {
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    if (Math.hypot(dx, dy) > 2) {
      const step = stepToward({ x: this.x, y: this.y }, this.target, WALK_SPEED, dt);
      this.x = step.x;
      this.y = step.y;
      this.moving = true;
      if (step.dir) this.dir = step.dir;
      this.pose = `walk-${this.dir}`;
    } else {
      this.x = this.target.x;
      this.y = this.target.y;
      this.moving = false;
      this.pose = STATE_POSE[this.state] ?? "sit";
    }
    const frames = this.sprite.frames(this.pose);
    if (frames > 1) {
      this.animTime += dt;
      this.frame = Math.floor(this.animTime * this.sprite.fps(this.pose)) % frames;
    } else {
      this.frame = 0;
    }
  }

  draw(g, time) {
    const fw = this.sprite.frameW;
    const fh = this.sprite.frameH;
    const x = Math.round(this.x - fw / 2);
    let y = Math.round(this.y) - fh;
    if (this.state === "waiting" && !this.moving) y += Math.abs(Math.sin(time * 6)) * -2;
    this.sprite.draw(g, this.pose, this.frame, x, y);
    if (this.state === "error" && !this.moving) {
      const blink = 0.15 + 0.3 * Math.abs(Math.sin(time * 8));
      g.fillStyle = `rgba(255,60,60,${blink.toFixed(2)})`;
      g.fillRect(x, y, fw, fh);
    }
    if (this.state === "executing" && !this.moving) {
      const pulse = 0.25 + 0.2 * Math.sin(time * 5);
      const grad = g.createRadialGradient(this.x, this.y, 2, this.x, this.y, 26);
      grad.addColorStop(0, `rgba(53,208,127,${pulse.toFixed(2)})`);
      grad.addColorStop(1, "rgba(53,208,127,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(this.x, this.y, 26, 0, Math.PI * 2);
      g.fill();
    }
    // name tag
    g.font = "10px ui-monospace, Menlo, monospace";
    const nw = g.measureText(this.name).width + 8;
    g.fillStyle = "rgba(10,12,16,0.75)";
    g.fillRect(Math.round(this.x - nw / 2), this.y + 2, nw, 12);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.fillText(this.name, this.x, this.y + 12);
    // bubble
    if (!this.moving) {
      if (this.detail) {
        drawSpeechBubble(g, this.x, y, clampText(this.detail));
      } else {
        const icon = STATE_ICON[this.state];
        if (icon) drawIconBubble(g, this.x, y, icon, this.state);
      }
    }
  }

}
