import Hero from "./Components/Home/Hero";
import HomepageDesign from "./Components/Home/HomepageDesign";
import DashboardNavbar from "./Components/Navigation/DashboardNavbar";

export default function Home() {
	return (
		<div className="">
			<DashboardNavbar />  
			<Hero />
			<HomepageDesign />
		</div>
	);
}

