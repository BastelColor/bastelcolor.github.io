'use client';

import { useState } from 'react';
import { VrmViewer } from '@/components/vrm/vrm-viewer';
import { avatars, boothUrl } from '@/content/avatars';
import { avatarMotion } from '@/content/motions';

/** この部屋に入った人はモデルを見に来ているので、最初の1体はすぐ読み込む */
export function AvatarRoom() {
  const [selectedId, setSelectedId] = useState(avatars[0].id);
  const selected =
    avatars.find((avatar) => avatar.id === selectedId) ?? avatars[0];

  return (
    <div className="avatar-room">
      <div className="avatar-room-stage">
        <VrmViewer
          key={selected.id}
          modelUrl={selected.modelUrl}
          modelName={selected.name}
          motionId={avatarMotion.id}
          brightness={selected.brightness}
          variant="bare"
          // Quiple の大きなしっぽなどが枠で切れないよう、部屋の左右の端まで描く
          bleedTo=".room-inner"
        />
      </div>

      <div className="avatar-room-side">
        <ul className="avatar-room-choices">
          {avatars.map((avatar) => (
            <li key={avatar.id}>
              <button
                type="button"
                className="avatar-room-choice"
                aria-pressed={avatar.id === selectedId}
                onClick={() => setSelectedId(avatar.id)}
              >
                <span className="avatar-room-icon">
                  <img src={avatar.icon.normal} alt="" />
                  <img className="is-happy" src={avatar.icon.happy} alt="" />
                </span>
                <span className="avatar-room-choice-text">
                  {avatar.name}
                  <small>{avatar.nameEn}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="avatar-room-hint">ドラッグでまわせます</p>
        <a href={selected.booth ?? boothUrl} target="_blank" rel="noreferrer">
          BOOTHで見る
        </a>
        <p className="avatar-room-credit">{avatarMotion.credit}</p>
      </div>
    </div>
  );
}
