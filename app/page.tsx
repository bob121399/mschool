import Link from "next/link";
import { GraduationCap, ShieldCheck, ListChecks } from "lucide-react";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-10 px-4 py-12 md:px-8">
      <div className="space-y-4">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <GraduationCap className="size-5" aria-hidden /> MSchool
        </p>
        <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
          Корпоративное обучение по утвержденным регламентам
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Источник → утвержденный курс → фиксированный трек для грейда → обучение → проверка → отчет.
          Публикация курсов и кадровые решения остаются за уполномоченными людьми.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground hover:bg-primary-hover">
            Войти
          </Link>
          <Link href="/signup" className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-5 font-medium hover:bg-muted">
            Начать пилот
          </Link>
        </div>
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        <li className="rounded-card border border-border bg-surface p-5">
          <ShieldCheck className="mb-2 size-5" aria-hidden />
          <p className="font-medium">Изоляция компаний</p>
          <p className="text-sm text-muted-foreground">Данные каждой компании отделены на уровне базы данных.</p>
        </li>
        <li className="rounded-card border border-border bg-surface p-5">
          <ListChecks className="mb-2 size-5" aria-hidden />
          <p className="font-medium">Фиксированные треки</p>
          <p className="text-sm text-muted-foreground">Состав, порядок и критерии прохождения не меняются тьютором.</p>
        </li>
        <li className="rounded-card border border-border bg-surface p-5">
          <GraduationCap className="mb-2 size-5" aria-hidden />
          <p className="font-medium">Проверка по рубрикам</p>
          <p className="text-sm text-muted-foreground">Итог считается детерминированно по критериям, с апелляцией.</p>
        </li>
      </ul>
    </main>
  );
}
