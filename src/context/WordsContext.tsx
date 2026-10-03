import React, { createContext, useState, Dispatch, SetStateAction } from 'react';

export type RiverWord = {
  id: number;
  word: string;
  s: number;     // 川筋に沿った位置（画面 px、0=奥）
  lane: number;  // 川幅に対する横の位置（-0.5〜0.5）
  age: number;   // 浮かび上がってからの秒数
  bobOffset: number;
  isPressed?: boolean;
};

export const WordsContext = createContext<{
  words: RiverWord[];
  setWords: Dispatch<SetStateAction<RiverWord[]>>;
}>({
  words: [],
  setWords: () => {},
});

export function WordsProvider({ children }: { children: React.ReactNode }) {
  const [words, setWords] = useState<RiverWord[]>([]);

  return (
    <WordsContext.Provider value={{ words, setWords }}>
      {children}
    </WordsContext.Provider>
  );
}
