'use client';

import { useEffect, useState } from 'react';
import { VrmViewer } from '@/components/vrm/vrm-viewer';
import { avatars, boothUrl } from '@/content/avatars';
import { avatarMotion } from '@/content/motions';
import { readLayers, replaceLayers } from '@/lib/history-layers';

/** URL（#avatar/quiple）で選ばれているアバター。無い・知らない子なら最初の1体 */
function linkedAvatarId() {
  const { avatar } = readLayers();
  return avatars.some((item) => item.id === avatar) ? avatar! : avatars[0].id;
}

/**
 * この部屋に入った人はモデルを見に来ているので、最初の1体はすぐ読み込む。
 * 選んだ子は URL（#avatar/quiple）に書く。選び直しても履歴は積まないので、
 * ブラウザの「戻る」では部屋ごともどる
 */
export function AvatarRoom() {
  const [selectedId, setSelectedId] = useState(linkedAvatarId);
  const selected =
    avatars.find((avatar) => avatar.id === selectedId) ?? avatars[0];

  const select = (id: string) => {
    setSelectedId(id);
    replaceLayers({ room: 'avatar', avatar: id });
  };

  // URL の # を手で書きかえたときなどに、選んでいる子を合わせる
  useEffect(() => {
    const onPopState = () => {
      // 部屋を閉じる「戻る」のときは、縮んでいくあいだにモデルを読み直さない
      if (readLayers().room === 'avatar') setSelectedId(linkedAvatarId());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
                onClick={() => select(avatar.id)}
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
