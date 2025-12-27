use ai_htn::{CompoundTask, HtnDomain, HtnPlanner, Method, Operator, OperatorId, Task};

type State = u64;

const HAS_MONEY: State = 1 << 0;
const AT_STORE: State = 1 << 1;
const AT_SHED: State = 1 << 2;
const HAS_TOOL: State = 1 << 3;

#[derive(Debug, Clone, PartialEq, Eq)]
enum Spec {
    TravelStore,
    TravelShed,
    BuyTool,
    PickupTool,
}

const GET_TOOL: CompoundTask = CompoundTask("get_tool");
const OP_TRAVEL_STORE: OperatorId = OperatorId("travel_store");
const OP_TRAVEL_SHED: OperatorId = OperatorId("travel_shed");
const OP_BUY_TOOL: OperatorId = OperatorId("buy_tool");
const OP_PICKUP_TOOL: OperatorId = OperatorId("pickup_tool");

fn domain() -> HtnDomain<Spec, State> {
    fn always(_s: &State) -> bool {
        true
    }
    fn has_money(s: &State) -> bool {
        (s & HAS_MONEY) == HAS_MONEY
    }
    fn at_store_with_money(s: &State) -> bool {
        (s & (HAS_MONEY | AT_STORE)) == (HAS_MONEY | AT_STORE)
    }
    fn at_shed(s: &State) -> bool {
        (s & AT_SHED) == AT_SHED
    }

    fn apply_travel_store(s: &mut State) {
        *s = (*s | AT_STORE) & !AT_SHED;
    }
    fn apply_travel_shed(s: &mut State) {
        *s = (*s | AT_SHED) & !AT_STORE;
    }
    fn apply_buy_tool(s: &mut State) {
        *s |= HAS_TOOL;
    }
    fn apply_pickup_tool(s: &mut State) {
        *s |= HAS_TOOL;
    }

    let mut d = HtnDomain::new();
    d.add_operator(
        OP_TRAVEL_STORE,
        Operator {
            name: "travel_store",
            spec: Spec::TravelStore,
            is_applicable: always,
            apply: apply_travel_store,
        },
    );
    d.add_operator(
        OP_TRAVEL_SHED,
        Operator {
            name: "travel_shed",
            spec: Spec::TravelShed,
            is_applicable: always,
            apply: apply_travel_shed,
        },
    );
    d.add_operator(
        OP_BUY_TOOL,
        Operator {
            name: "buy_tool",
            spec: Spec::BuyTool,
            is_applicable: at_store_with_money,
            apply: apply_buy_tool,
        },
    );
    d.add_operator(
        OP_PICKUP_TOOL,
        Operator {
            name: "pickup_tool",
            spec: Spec::PickupTool,
            is_applicable: at_shed,
            apply: apply_pickup_tool,
        },
    );

    d.add_method(
        GET_TOOL,
        Method {
            name: "buy_from_store",
            precondition: has_money,
            subtasks: vec![Task::Primitive(OP_TRAVEL_STORE), Task::Primitive(OP_BUY_TOOL)],
        },
    );
    d.add_method(
        GET_TOOL,
        Method {
            name: "pickup_from_shed",
            precondition: always,
            subtasks: vec![Task::Primitive(OP_TRAVEL_SHED), Task::Primitive(OP_PICKUP_TOOL)],
        },
    );

    d
}

#[test]
fn planner_picks_first_applicable_method() {
    let planner = HtnPlanner::new(domain());
    let root = vec![Task::Compound(GET_TOOL)];

    let plan = planner.plan(&HAS_MONEY, &root).unwrap();
    assert_eq!(
        plan.steps,
        vec![Spec::TravelStore, Spec::BuyTool],
        "money present should use store method"
    );

    let plan = planner.plan(&0, &root).unwrap();
    assert_eq!(
        plan.steps,
        vec![Spec::TravelShed, Spec::PickupTool],
        "no money should use shed method"
    );
}

