import { state } from '@markless/core';

export default function Study(props: { label: string }) @{
	let open = state(false);

	<section class="study" data-probe="study">
		<style>
			.study { --study-mark: study; border: 3px solid rgb(120, 20, 160); padding: 10px; }
			.study .part-1 { margin-left: 1px; color: rgb(1, 40, 90); }
			.study .part-2 { margin-left: 2px; color: rgb(2, 40, 90); }
			.study .part-3 { margin-left: 3px; color: rgb(3, 40, 90); }
			.study .part-4 { margin-left: 4px; color: rgb(4, 40, 90); }
			.study .part-5 { margin-left: 5px; color: rgb(5, 40, 90); }
			.study .part-6 { margin-left: 6px; color: rgb(6, 40, 90); }
			.study .part-7 { margin-left: 7px; color: rgb(7, 40, 90); }
			.study .part-8 { margin-left: 8px; color: rgb(8, 40, 90); }
			.study .part-9 { margin-left: 9px; color: rgb(9, 40, 90); }
			.study .part-10 { margin-left: 10px; color: rgb(10, 40, 90); }
			.study .part-11 { margin-left: 11px; color: rgb(11, 40, 90); }
			.study .part-12 { margin-left: 12px; color: rgb(12, 40, 90); }
			.study .part-13 { margin-left: 13px; color: rgb(13, 40, 90); }
			.study .part-14 { margin-left: 14px; color: rgb(14, 40, 90); }
			.study .part-15 { margin-left: 15px; color: rgb(15, 40, 90); }
			.study .part-16 { margin-left: 16px; color: rgb(16, 40, 90); }
			.study .part-17 { margin-left: 17px; color: rgb(17, 40, 90); }
			.study .part-18 { margin-left: 18px; color: rgb(18, 40, 90); }
			.study .part-19 { margin-left: 19px; color: rgb(19, 40, 90); }
			.study .part-20 { margin-left: 20px; color: rgb(20, 40, 90); }
			.study .part-21 { margin-left: 21px; color: rgb(21, 40, 90); }
			.study .part-22 { margin-left: 22px; color: rgb(22, 40, 90); }
			.study .part-23 { margin-left: 23px; color: rgb(23, 40, 90); }
			.study .part-24 { margin-left: 24px; color: rgb(24, 40, 90); }
			.study .part-25 { margin-left: 25px; color: rgb(25, 40, 90); }
			.study .part-26 { margin-left: 26px; color: rgb(26, 40, 90); }
			.study .part-27 { margin-left: 27px; color: rgb(27, 40, 90); }
			.study .part-28 { margin-left: 28px; color: rgb(28, 40, 90); }
			.study .part-29 { margin-left: 29px; color: rgb(29, 40, 90); }
			.study .part-30 { margin-left: 30px; color: rgb(30, 40, 90); }
			.study .part-31 { margin-left: 31px; color: rgb(31, 40, 90); }
			.study .part-32 { margin-left: 32px; color: rgb(32, 40, 90); }
			.study .part-33 { margin-left: 33px; color: rgb(33, 40, 90); }
			.study .part-34 { margin-left: 34px; color: rgb(34, 40, 90); }
			.study .part-35 { margin-left: 35px; color: rgb(35, 40, 90); }
			.study .part-36 { margin-left: 36px; color: rgb(36, 40, 90); }
			.study .part-37 { margin-left: 37px; color: rgb(37, 40, 90); }
			.study .part-38 { margin-left: 38px; color: rgb(38, 40, 90); }
			.study .part-39 { margin-left: 39px; color: rgb(39, 40, 90); }
			.study .part-40 { margin-left: 40px; color: rgb(40, 40, 90); }
			.study .part-41 { margin-left: 41px; color: rgb(41, 40, 90); }
			.study .part-42 { margin-left: 42px; color: rgb(42, 40, 90); }
			.study .part-43 { margin-left: 43px; color: rgb(43, 40, 90); }
			.study .part-44 { margin-left: 44px; color: rgb(44, 40, 90); }
			.study .part-45 { margin-left: 45px; color: rgb(45, 40, 90); }
			.study .part-46 { margin-left: 46px; color: rgb(46, 40, 90); }
			.study .part-47 { margin-left: 47px; color: rgb(47, 40, 90); }
			.study .part-48 { margin-left: 48px; color: rgb(48, 40, 90); }
			.study .part-49 { margin-left: 49px; color: rgb(49, 40, 90); }
			.study .part-50 { margin-left: 50px; color: rgb(50, 40, 90); }
			.study .part-51 { margin-left: 51px; color: rgb(51, 40, 90); }
			.study .part-52 { margin-left: 52px; color: rgb(52, 40, 90); }
			.study .part-53 { margin-left: 53px; color: rgb(53, 40, 90); }
			.study .part-54 { margin-left: 54px; color: rgb(54, 40, 90); }
			.study .part-55 { margin-left: 55px; color: rgb(55, 40, 90); }
			.study .part-56 { margin-left: 56px; color: rgb(56, 40, 90); }
			.study .part-57 { margin-left: 57px; color: rgb(57, 40, 90); }
			.study .part-58 { margin-left: 58px; color: rgb(58, 40, 90); }
			.study .part-59 { margin-left: 59px; color: rgb(59, 40, 90); }
			.study .part-60 { margin-left: 60px; color: rgb(60, 40, 90); }
			.study .part-61 { margin-left: 61px; color: rgb(61, 40, 90); }
			.study .part-62 { margin-left: 62px; color: rgb(62, 40, 90); }
			.study .part-63 { margin-left: 63px; color: rgb(63, 40, 90); }
			.study .part-64 { margin-left: 64px; color: rgb(64, 40, 90); }
			.study .part-65 { margin-left: 65px; color: rgb(65, 40, 90); }
			.study .part-66 { margin-left: 66px; color: rgb(66, 40, 90); }
			.study .part-67 { margin-left: 67px; color: rgb(67, 40, 90); }
			.study .part-68 { margin-left: 68px; color: rgb(68, 40, 90); }
			.study .part-69 { margin-left: 69px; color: rgb(69, 40, 90); }
			.study .part-70 { margin-left: 70px; color: rgb(70, 40, 90); }
			.study .part-71 { margin-left: 71px; color: rgb(71, 40, 90); }
			.study .part-72 { margin-left: 72px; color: rgb(72, 40, 90); }
			.study .part-73 { margin-left: 73px; color: rgb(73, 40, 90); }
			.study .part-74 { margin-left: 74px; color: rgb(74, 40, 90); }
			.study .part-75 { margin-left: 75px; color: rgb(75, 40, 90); }
			.study .part-76 { margin-left: 76px; color: rgb(76, 40, 90); }
			.study .part-77 { margin-left: 77px; color: rgb(77, 40, 90); }
			.study .part-78 { margin-left: 78px; color: rgb(78, 40, 90); }
			.study .part-79 { margin-left: 79px; color: rgb(79, 40, 90); }
			.study .part-80 { margin-left: 80px; color: rgb(80, 40, 90); }
			.study .part-81 { margin-left: 81px; color: rgb(81, 40, 90); }
			.study .part-82 { margin-left: 82px; color: rgb(82, 40, 90); }
			.study .part-83 { margin-left: 83px; color: rgb(83, 40, 90); }
			.study .part-84 { margin-left: 84px; color: rgb(84, 40, 90); }
			.study .part-85 { margin-left: 85px; color: rgb(85, 40, 90); }
			.study .part-86 { margin-left: 86px; color: rgb(86, 40, 90); }
			.study .part-87 { margin-left: 87px; color: rgb(87, 40, 90); }
			.study .part-88 { margin-left: 88px; color: rgb(88, 40, 90); }
			.study .part-89 { margin-left: 89px; color: rgb(89, 40, 90); }
			.study .part-90 { margin-left: 90px; color: rgb(90, 40, 90); }
			.study .part-91 { margin-left: 91px; color: rgb(91, 40, 90); }
			.study .part-92 { margin-left: 92px; color: rgb(92, 40, 90); }
			.study .part-93 { margin-left: 93px; color: rgb(93, 40, 90); }
			.study .part-94 { margin-left: 94px; color: rgb(94, 40, 90); }
			.study .part-95 { margin-left: 95px; color: rgb(95, 40, 90); }
			.study .part-96 { margin-left: 96px; color: rgb(96, 40, 90); }
			.study .part-97 { margin-left: 97px; color: rgb(97, 40, 90); }
			.study .part-98 { margin-left: 98px; color: rgb(98, 40, 90); }
			.study .part-99 { margin-left: 99px; color: rgb(99, 40, 90); }
			.study .part-100 { margin-left: 100px; color: rgb(100, 40, 90); }
			.study .part-101 { margin-left: 101px; color: rgb(101, 40, 90); }
			.study .part-102 { margin-left: 102px; color: rgb(102, 40, 90); }
			.study .part-103 { margin-left: 103px; color: rgb(103, 40, 90); }
			.study .part-104 { margin-left: 104px; color: rgb(104, 40, 90); }
			.study .part-105 { margin-left: 105px; color: rgb(105, 40, 90); }
			.study .part-106 { margin-left: 106px; color: rgb(106, 40, 90); }
			.study .part-107 { margin-left: 107px; color: rgb(107, 40, 90); }
			.study .part-108 { margin-left: 108px; color: rgb(108, 40, 90); }
			.study .part-109 { margin-left: 109px; color: rgb(109, 40, 90); }
			.study .part-110 { margin-left: 110px; color: rgb(110, 40, 90); }
			.study .part-111 { margin-left: 111px; color: rgb(111, 40, 90); }
			.study .part-112 { margin-left: 112px; color: rgb(112, 40, 90); }
			.study .part-113 { margin-left: 113px; color: rgb(113, 40, 90); }
			.study .part-114 { margin-left: 114px; color: rgb(114, 40, 90); }
			.study .part-115 { margin-left: 115px; color: rgb(115, 40, 90); }
			.study .part-116 { margin-left: 116px; color: rgb(116, 40, 90); }
			.study .part-117 { margin-left: 117px; color: rgb(117, 40, 90); }
			.study .part-118 { margin-left: 118px; color: rgb(118, 40, 90); }
			.study .part-119 { margin-left: 119px; color: rgb(119, 40, 90); }
			.study .part-120 { margin-left: 120px; color: rgb(120, 40, 90); }
		</style>
		<button type="button" data-toggle onClick={() => (open = !open)}>{props.label}</button>
		@if (open) {
			<p class="part-1">{'Open'}</p>
		}
	</section>
}
