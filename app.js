$(document).ready(function(){

  $("#nav-toggle").click(function(){
    // If nav is
    if ($(".nav").css("bottom") < "0"){
      $(".nav").css("bottom", "0");
      $(".nav").css("box-shadow", "0 -19px 38px rgba(0,0,0,0.30), 0 -15px 12px rgba(0,0,0,0.22)");
      $("#nav-toggle").removeClass("lnr lnr-menu");
      $("#nav-toggle").addClass("lnr lnr-cross");
    } else {
      $(".nav").css("bottom", "-40vh");
      $(".nav").css("box-shadow", "0 0 0");
      $("#nav-toggle").removeClass("lnr lnr-cross");
      $("#nav-toggle").addClass("lnr lnr-menu");
    }
  })

  $(".nav>a").click(function(){
    $(".nav").css("bottom", "-40vh");
    $(".nav").css("box-shadow", "0 0 0");
    $("#nav-toggle").removeClass("lnr lnr-cross");
    $("#nav-toggle").addClass("lnr lnr-menu");
  })

})
