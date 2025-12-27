import { format, parseISO } from "date-fns";
import type { FC } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../../../ui/avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../../ui/command";
import { cn } from "@/lib/utils";
import { useCalendar } from "../../contexts/calendar-context";
import { EventDetailsDialog } from "../../dialogs/event-details-dialog";
import {
  formatTime,
  getBgColor,
  getColorClass,
  getEventsForMonth,
  getFirstLetters,
  toCapitalize,
} from "../../helpers";
import { EventBullet } from "../month-view/event-bullet";

export const AgendaEvents: FC = () => {
  const { events, use24HourFormat, badgeVariant, agendaModeGroupBy, selectedDate } = useCalendar();

  const monthEvents = getEventsForMonth(events, selectedDate);

  const agendaEvents = monthEvents.reduce<Record<string, typeof monthEvents>>((acc, event) => {
    const key =
      agendaModeGroupBy === "date" ? format(parseISO(event.startDate), "yyyy-MM-dd") : event.color;
    (acc[key] ||= []).push(event);
    return acc;
  }, {});

  const groupedAndSortedEvents = Object.entries(agendaEvents).sort((a, b) => {
    if (agendaModeGroupBy === "date") {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    }
    return a[0].localeCompare(b[0]);
  });

  return (
    <Command className="h-[80vh] bg-transparent py-4">
      <div className="mx-4 mb-4">
        <CommandInput placeholder="Type a command or search..." />
      </div>
      <CommandList className="max-h-max border-t px-3">
        {groupedAndSortedEvents.map(([groupKey, groupedEvents]) => (
          <CommandGroup
            key={groupKey}
            heading={
              agendaModeGroupBy === "date"
                ? format(parseISO(groupKey), "EEEE, MMMM d, yyyy")
                : toCapitalize(groupedEvents[0]?.color ?? groupKey)
            }
          >
            {groupedEvents.map((event) => (
              <CommandItem
                key={event.id}
                className={cn(
                  "mb-2 rounded-md border p-4 transition-all data-[selected=true]:bg-bg data-[selected=true]:text-none hover:cursor-pointer",
                  {
                    [getColorClass(event.color)]: badgeVariant === "colored",
                    "hover:bg-zinc-200 dark:hover:bg-gray-900": badgeVariant === "dot",
                    "hover:opacity-60": badgeVariant === "colored",
                  }
                )}
              >
                <EventDetailsDialog event={event}>
                  <div className="flex w-full items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {badgeVariant === "dot" ? (
                        <EventBullet color={event.color} />
                      ) : (
                        <Avatar>
                          <AvatarImage src="" alt="@shadcn" />
                          <AvatarFallback className={getBgColor(event.color)}>
                            {getFirstLetters(event.title)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="flex flex-col">
                        <p
                          className={cn({
                            "font-medium": badgeVariant === "dot",
                            "text-foreground": badgeVariant === "dot",
                          })}
                        >
                          {event.title}
                        </p>
                        <p className="line-clamp-1 w-1/3 text-ellipsis text-sm text-muted-foreground md:text-clip">
                          {event.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex w-40 items-center justify-center gap-1">
                      {agendaModeGroupBy === "date" ? (
                        <>
                          <p className="text-sm">{formatTime(event.startDate, use24HourFormat)}</p>
                          <span className="text-muted-foreground">-</span>
                          <p className="text-sm">{formatTime(event.endDate, use24HourFormat)}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm">
                            {format(parseISO(event.startDate), "MM/dd/yyyy")}
                          </p>
                          <span className="text-sm">at</span>
                          <p className="text-sm">{formatTime(event.startDate, use24HourFormat)}</p>
                        </>
                      )}
                    </div>
                  </div>
                </EventDetailsDialog>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandEmpty>No results found.</CommandEmpty>
      </CommandList>
    </Command>
  );
};
