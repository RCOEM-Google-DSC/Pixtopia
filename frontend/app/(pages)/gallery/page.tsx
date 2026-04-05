"use client";

import { motion } from "motion/react";
import { ArrowRight, Heart } from "lucide-react";
import SiteNavbar from "@/app/Components/Navigation/DashboardNavbar";
import Image from "next/image";
import Footer from "@/app/Components/Footer";
interface ArtItem {
  id: string;
  imageUrl: string;
}

const PHOTOS: ArtItem[] = [
  {
    id: "1",
    imageUrl: "/photos/01.JPG",
  },
  {
    id: "2",
    imageUrl: "/photos/02.JPG",
  },
  {
    id: "3",
    imageUrl: "/photos/03.JPG",
  },
  {
    id: "4",
    imageUrl: "/photos/04.JPG",
  },
  {
    id:"5",
    imageUrl: "/photos/05.JPG",
  }
];

export default function App() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-black text-white selection:bg-white/30">
      <SiteNavbar />
      {/* hero */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <section className="w-full max-w-6xl mx-auto px-4 md:px-8 pt-24">
          <div className="flex items-center gap-4 ">
            <div className="rounded-full border border-white/20 bg-black/35 px-6 py-2 backdrop-blur-sm">
              <h2 className="text-sm tracking-[0.2em] uppercase text-slate-200">
               Meet The Team 
              </h2>
            </div>
            <div className="h-px grow bg-linear-to-r from-white/35 to-transparent" />
          </div>
          <div className="relative mt-10 rounded-2xl overflow-hidden border border-white/20 bg-black/30 backdrop-blur-sm group">
            <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent z-10" />
            <div className="absolute top-5 right-5 z-20 flex gap-3">
              <span className="rounded-full border border-white/35 bg-black/45 px-4 py-1.5 text-[15px] tracking-[0.15em] uppercase text-slate-200">
                March 23, 2026
              </span>
            </div>

            <div className="relative w-full h-[800px]">
            <Image
              src="/photos/team_photo.jpg"
              alt="Featured artwork"
              fill
              className="w-full brightness-125 object-cover group-hover:scale-[1.03] transition duration-500"
            />
            </div>
          </div>
        </section>
      </motion.div>

      {/* art grid */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <section className="w-full max-w-6xl mx-auto mt-16 px-4 md:px-8 pb-24">
          <div className="flex items-center gap-4 mb-8">
            <div className="rounded-full border border-white/20 bg-black/35 px-6 py-2 backdrop-blur-sm">
              <h2 className="text-sm tracking-[0.2em] uppercase text-slate-200">
                Best Moments
              </h2>
            </div>
            <div className="h-px grow bg-linear-to-r from-white/35 to-transparent" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <article className="relative md:col-span-2 md:row-span-2 rounded-2xl overflow-hidden border border-white/20 bg-black/30 group">
              <Image
                src={PHOTOS[0].imageUrl}
                height={600}
                width={800}
                alt={PHOTOS[0].id}
                className="w-full h-full object-cover transition duration-500 group-hover:scale-105 group-hover:brightness-110"
              />
            </article>

            {PHOTOS.slice(1).map((art) => (
              <article
                key={art.id}
                className="relative rounded-xl overflow-hidden border border-white/15 aspect-square bg-black/30 group"
              >
                <Image
                  src={art.imageUrl}
                  alt={art.id}
                  height={400}
                  width={400}
                  className="w-full h-full object-cover transition duration-500 group-hover:scale-110 group-hover:brightness-110"
                />
                <div className="absolute inset-x-0 bottom-0 p-3 bg-linear-to-t from-black/90 to-transparent">
                  <p className="text-sm text-white tracking-wide">
                    {art.title}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </motion.div>
      <Footer />
    </div>
  );
}
