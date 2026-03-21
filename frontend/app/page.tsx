import Hero from "./Components/Home/Hero";
import HomepageDesign from "./Components/Home/HomepageDesign";
import SiteNavbar from "./Components/Navigation/DashboardNavbar";

export default function Home() {
	return (
		<div>
			<SiteNavbar />
			<Hero />
			<HomepageDesign />
		</div>
	);
}

