// 画面に出すモデルの名前と説明。
// 判定（◎△×）に使うのは MSM・ECMWF の2つだけ。GSM・AIFS は見比べるための「参考モデル」。

export const MAIN_MODELS = ['msm', 'ecmwf']
export const REFERENCE_MODELS = ['gsm', 'aifs']
export const ALL_MODELS = [...MAIN_MODELS, ...REFERENCE_MODELS]

export const MODEL_INFO = {
  msm: { label: 'MSM', description: '気象庁・約5km四方・4日先まで' },
  ecmwf: { label: 'ECMWF', description: '欧州・約25km四方・7日先まで' },
  gsm: { label: 'GSM', description: '気象庁の全球モデル・約55km四方' },
  aifs: {
    label: 'AIFS',
    description: 'ECMWFのAI版・約28km四方',
    // 説明が1行に収まるよう、注意は別の行に出す
    note: '※元は6時間ごとの値を、1時間ごとに補間',
  },
}

export const isReferenceModel = (key) => REFERENCE_MODELS.includes(key)
