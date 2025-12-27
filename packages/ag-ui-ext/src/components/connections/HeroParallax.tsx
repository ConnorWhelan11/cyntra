"use client";
import { motion, MotionValue, useScroll, useSpring, useTransform } from "framer-motion";
import React from "react";
import { ConnectionCard, type ConnectionCardProps } from "./ConnectionCard";

type ConnectionItem = ConnectionCardProps & { id: string };

export const HeroParallax = ({
  connections,
  header,
}: {
  connections: ConnectionItem[];
  header: React.ReactNode;
}) => {
  const firstRow = connections.slice(0, 5);
  const secondRow = connections.slice(5, 10);
  const thirdRow = connections.slice(10, 15);
  const fourthRow = connections.slice(15, 20);
  const ref = React.useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const springConfig = { stiffness: 300, damping: 30, bounce: 100 };

  const translateX = useSpring(useTransform(scrollYProgress, [0, 1], [0, 1000]), springConfig);
  const translateXReverse = useSpring(
    useTransform(scrollYProgress, [0, 1], [0, -1000]),
    springConfig
  );
  const rotateX = useSpring(useTransform(scrollYProgress, [0, 0.2], [15, 0]), springConfig);
  const opacity = useSpring(useTransform(scrollYProgress, [0, 0.2], [0.2, 1]), springConfig);
  const rotateZ = useSpring(useTransform(scrollYProgress, [0, 0.2], [20, 0]), springConfig);
  const translateY = useSpring(useTransform(scrollYProgress, [0, 0.2], [-700, 500]), springConfig);
  return (
    <div
      ref={ref}
      className="h-[200vh] py-40 overflow-hidden antialiased relative flex flex-col self-auto [perspective:1000px] [transform-style:preserve-3d]"
    >
      <div className="max-w-7xl relative mx-auto px-4 w-full left-0 top-0">{header}</div>
      <motion.div
        style={{
          rotateX,
          rotateZ,
          translateY,
          opacity,
        }}
        className=""
      >
        <motion.div className="flex flex-row-reverse space-x-reverse space-x-20 mb-20">
          {firstRow.map((item) => (
            <ParallaxCard item={item} translate={translateX} key={item.id} />
          ))}
        </motion.div>
        <motion.div className="flex flex-row mb-20 space-x-20 ">
          {secondRow.map((item) => (
            <ParallaxCard item={item} translate={translateXReverse} key={item.id} />
          ))}
        </motion.div>
        <motion.div className="flex flex-row-reverse space-x-reverse space-x-20 mb-20">
          {thirdRow.map((item) => (
            <ParallaxCard item={item} translate={translateX} key={item.id} />
          ))}
        </motion.div>
        <motion.div className="flex flex-row mb-20 space-x-20">
          {fourthRow.map((item) => (
            <ParallaxCard item={item} translate={translateXReverse} key={item.id} />
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
};

export const ParallaxCard = ({
  item,
  translate,
}: {
  item: ConnectionItem;
  translate: MotionValue<number>;
}) => {
  return (
    <motion.div
      style={{
        x: translate,
      }}
      whileHover={{
        y: -20,
      }}
      key={item.id}
      className="group/product h-80 w-[24rem] relative shrink-0"
    >
      <ConnectionCard
        {...item}
        className="h-full w-full pointer-events-none group-hover/product:pointer-events-auto"
      />
    </motion.div>
  );
};
