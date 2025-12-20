"use client";

import { motion } from "framer-motion";
import {
	CalendarRange,
	Columns,
	Grid2X2,
	Grid3X3,
	LayoutList,
	List
} from "lucide-react";

import { Button } from "../../ui/button";
import { ButtonGroup } from "../../ui/button-group";
import {
	slideFromLeft,
	slideFromRight,
	transition,
} from "../animations";
import { useCalendar } from "../contexts/calendar-context";
import { AddEditEventDialog } from "../dialogs/add-edit-event-dialog";
import { DateNavigator } from "./date-navigator";
import FilterEvents from "./filter";
import { TodayButton } from "./today-button";
import { UserSelect } from "./user-select";
import { Settings } from "../settings/settings";
import Views from "./view-tabs";
import { PlusIcon } from "@radix-ui/react-icons";

export function CalendarHeader() {
	const { view, events } = useCalendar();

	return (
		<div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
			<motion.div
				className="flex items-center gap-3"
				variants={slideFromLeft}
				initial="initial"
				animate="animate"
				transition={transition}
			>
				<TodayButton />
				<DateNavigator view={view} events={events} />
			</motion.div>

			<motion.div
				className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-1.5"
				variants={slideFromRight}
				initial="initial"
				animate="animate"
				transition={transition}
			>
				<div className="options flex-wrap flex items-center gap-4 md:gap-2">
					<FilterEvents />
					<Views />
				</div>

				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-1.5">
					<UserSelect />

					<AddEditEventDialog>
						<Button>
							<PlusIcon className="h-4 w-4" />
							Add Event
						</Button>
					</AddEditEventDialog>
				</div>
				<Settings />
			</motion.div>
		</div>
	);
}
